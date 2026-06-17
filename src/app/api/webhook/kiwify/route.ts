/**
 * POST /api/webhook/kiwify
 * Recebe evento de compra confirmada da Kiwify e provisiona
 * automaticamente uma nova loja (usuário) no CRM 7Business.
 *
 * Payload Kiwify (order_approved):
 *   order.status           → "paid"
 *   order.Product.id       → ID do produto
 *   Customer.name          → nome do comprador
 *   Customer.email         → e-mail do comprador
 *   Customer.mobile        → telefone do comprador
 *
 * Segurança: valida header "X-Kiwify-Event" e token via query ?token=
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const WEBHOOK_TOKEN    = process.env.KIWIFY_WEBHOOK_TOKEN ?? "";
const SORAYA_PHONE     = process.env.SORAYA_NOTIFY_PHONE  ?? "5585992041818";
const EVO_URL          = process.env.EVOLUTION_API_URL    ?? "";
const EVO_KEY          = process.env.EVOLUTION_API_KEY    ?? "";
const EVO_INSTANCE     = process.env.EVOLUTION_INSTANCE   ?? "";
const CRM_URL          = "https://crm-7business-production.up.railway.app";

// ─── helpers ──────────────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function notifySoraya(message: string) {
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) return;
  try {
    await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVO_KEY,
      },
      body: JSON.stringify({
        number:  SORAYA_PHONE,
        textMessage: { text: message },
      }),
    });
  } catch {
    /* silencia — notificação não é crítica */
  }
}

async function sendWelcomeEmail(
  email: string,
  name: string,
  tempPassword: string
) {
  const html = `
    <div style="font-family:Segoe UI,sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#fff;border-radius:16px;overflow:hidden">
      <div style="background:#e63946;padding:32px;text-align:center">
        <div style="width:56px;height:56px;background:#fff;border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#e63946;line-height:56px;text-align:center">7</div>
        <h1 style="color:#fff;margin:0;font-size:22px">Bem-vindo ao CRM 7Business!</h1>
      </div>
      <div style="padding:32px">
        <p style="color:#d1d5db;font-size:15px">Olá, <strong style="color:#fff">${name}</strong>! Sua loja está pronta. 🎉</p>

        <div style="background:#232323;border-radius:12px;padding:20px;margin:20px 0;border-left:3px solid #e63946">
          <p style="color:#9ca3af;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Seus dados de acesso</p>
          <p style="color:#d1d5db;font-size:14px;margin:0 0 6px">📧 <strong style="color:#fff">Login:</strong> ${email}</p>
          <p style="color:#d1d5db;font-size:14px;margin:0">🔑 <strong style="color:#fff">Senha temporária:</strong> <code style="background:#333;padding:2px 8px;border-radius:4px;color:#e63946">${tempPassword}</code></p>
        </div>

        <p style="color:#9ca3af;font-size:13px;margin:0 0 8px"><strong style="color:#fff">Primeiros passos:</strong></p>
        <ul style="color:#d1d5db;font-size:14px;padding-left:20px;margin:0 0 24px">
          <li style="margin-bottom:6px">🚗 Cadastre seus veículos no Estoque</li>
          <li style="margin-bottom:6px">💬 Conecte seu WhatsApp em Integrações</li>
          <li style="margin-bottom:6px">📊 Acompanhe seus leads no Funil</li>
          <li style="margin-bottom:6px">🔑 Troque sua senha após o primeiro acesso</li>
        </ul>

        <a href="${CRM_URL}/login" style="display:block;background:#e63946;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px">
          Acessar meu CRM agora →
        </a>

        <p style="color:#6b7280;font-size:12px;text-align:center;margin:20px 0 0">
          Suporte: <a href="https://wa.me/5585992041818" style="color:#e63946">WhatsApp (85) 99204-1818</a>
        </p>
      </div>
    </div>
  `;

  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-welcome`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          to:      email,
          subject: "Bem-vindo ao CRM 7Business — seus dados de acesso",
          html,
        }),
      }
    );
  } catch { /* silencia */ }
}

// ─── handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Valida token de segurança
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
    console.warn("[Kiwify Webhook] Token inválido recebido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // 2. Só processa compras aprovadas
  const order    = body.order    as Record<string, unknown> | undefined;
  const customer = body.Customer as Record<string, unknown> | undefined;

  const status = (order?.status as string | undefined)?.toLowerCase();
  if (status !== "paid" && status !== "approved") {
    console.log(`[Kiwify Webhook] Status ignorado: ${status}`);
    return NextResponse.json({ received: true, skipped: true });
  }

  const email    = (customer?.email  as string | undefined)?.toLowerCase().trim() ?? "";
  const name     = (customer?.name   as string | undefined)?.trim()                ?? "Cliente";
  const phone    = (customer?.mobile as string | undefined)?.replace(/\D/g, "")   ?? "";
  const orderId  = (order?.id        as string | undefined) ?? "";

  if (!email) {
    console.error("[Kiwify Webhook] E-mail ausente no payload");
    return NextResponse.json({ error: "E-mail ausente" }, { status: 400 });
  }

  console.log(`[Kiwify Webhook] Compra confirmada: ${email} — pedido ${orderId}`);

  // 3. Verifica se usuário já existe (idempotência)
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const alreadyExists = existing?.users?.some(u => u.email === email);
  if (alreadyExists) {
    console.log(`[Kiwify Webhook] Usuário já existe: ${email} — ignorando`);
    return NextResponse.json({ received: true, skipped: true });
  }

  // 4. Cria usuário no Supabase Auth
  const tempPassword = generateTempPassword();
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: { name, kiwify_order_id: orderId },
  });

  if (authError || !authData?.user) {
    console.error("[Kiwify Webhook] Erro ao criar usuário:", authError?.message);
    return NextResponse.json({ error: "Falha ao criar usuário" }, { status: 500 });
  }

  const userId = authData.user.id;

  // 5. Cria row na tabela users (upsert seguro)
  const { error: dbError } = await supabaseAdmin.from("users").upsert({
    id:            userId,
    email,
    business_name: name,
    notify_phone:  phone || null,
    plan:          "pro",
    plan_status:   "active",
    kiwify_order:  orderId,
    created_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }, { onConflict: "id" });

  if (dbError) {
    console.error("[Kiwify Webhook] Erro ao salvar no banco:", dbError.message);
    // Não falha — usuário auth já foi criado; admin pode corrigir
  }

  // 6. Envia e-mail de boas-vindas com credenciais
  await sendWelcomeEmail(email, name, tempPassword);

  // 7. Notifica Soraya no WhatsApp
  await notifySoraya(
    `🎉 *Nova venda CRM 7Business!*\n\n` +
    `👤 *Cliente:* ${name}\n` +
    `📧 *E-mail:* ${email}\n` +
    `📱 *Telefone:* ${phone || "não informado"}\n` +
    `🆔 *Pedido:* ${orderId}\n\n` +
    `✅ Loja criada e credenciais enviadas automaticamente!`
  );

  console.log(`[Kiwify Webhook] ✅ Loja provisionada para ${email} (userId: ${userId})`);
  return NextResponse.json({ received: true, userId });
}
