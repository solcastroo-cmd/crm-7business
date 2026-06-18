/**
 * POST /api/webhook/kiwify
 * Recebe compra confirmada da Kiwify:
 *  1. Cria usuário no Supabase
 *  2. Gera link de criação de senha
 *  3. Envia link via WhatsApp para o cliente (Evolution API)
 *  4. Notifica Soraya com resumo da venda
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const WEBHOOK_TOKEN = process.env.KIWIFY_WEBHOOK_TOKEN ?? "";
const SORAYA_PHONE  = process.env.SORAYA_NOTIFY_PHONE  ?? "5585992041818";
const EVO_URL       = process.env.EVOLUTION_API_URL    ?? "";
const EVO_KEY       = process.env.EVOLUTION_API_KEY    ?? "";
const EVO_INSTANCE  = process.env.EVOLUTION_INSTANCE   ?? "";
const CRM_URL       = "https://crm-7business-production.up.railway.app";

async function sendWhatsApp(phone: string, message: string) {
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE || !phone) return;
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 10) return;
  try {
    await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({ number: clean, textMessage: { text: message } }),
    });
  } catch { /* silencia */ }
}

export async function POST(req: NextRequest) {
  // 1. Valida token
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  console.log("[Kiwify] Payload:", JSON.stringify(body).slice(0, 300));

  // 2. Filtra só compras pagas
  const order    = body.order    as Record<string, unknown> | undefined;
  const customer = body.Customer as Record<string, unknown> | undefined;
  const status   = (order?.status as string | undefined)?.toLowerCase();

  if (status !== "paid" && status !== "approved") {
    return NextResponse.json({ received: true, skipped: true });
  }

  const email   = (customer?.email  as string | undefined)?.toLowerCase().trim() ?? "";
  const name    = (customer?.name   as string | undefined)?.trim()                ?? "Cliente";
  const phone   = (customer?.mobile as string | undefined)?.replace(/\D/g, "")   ?? "";
  const orderId = (order?.id        as string | undefined) ?? "";

  if (!email) {
    return NextResponse.json({ error: "E-mail ausente" }, { status: 400 });
  }

  console.log(`[Kiwify] Compra: ${email} | pedido: ${orderId}`);

  // 3. Idempotência
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const alreadyExists = existing?.users?.some(u => u.email === email);
  if (alreadyExists) {
    console.log(`[Kiwify] Usuário já existe: ${email}`);
    return NextResponse.json({ received: true, skipped: true });
  }

  // 4. Cria usuário (confirmado, sem senha — cliente vai definir)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name, kiwify_order_id: orderId },
  });

  if (authError || !authData?.user) {
    console.error("[Kiwify] Erro ao criar usuário:", authError?.message);
    return NextResponse.json({ error: "Falha ao criar usuário" }, { status: 500 });
  }

  const userId = authData.user.id;

  // 5. Salva na tabela users
  await supabaseAdmin.from("users").upsert({
    id:            userId,
    email,
    business_name: name,
    notify_phone:  phone || null,
    plan:          "pro",
    plan_status:   "active",
    kiwify_order:  orderId,
    created_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }, { onConflict: "id" }).then(({ error }) => {
    if (error) console.error("[Kiwify] Erro DB:", error.message);
  });

  // 6. Gera link de criação de senha
  const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
    type:        "recovery",
    email,
    options: { redirectTo: `${CRM_URL}/auth/reset-password` },
  });

  const accessLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? `${CRM_URL}/login`;

  // 7. Envia link para o cliente via WhatsApp
  if (phone) {
    await sendWhatsApp(phone,
      `✅ *Olá, ${name}!*\n\n` +
      `Sua assinatura do *CRM 7Business* foi confirmada! 🎉\n\n` +
      `Clique no link abaixo para criar sua senha e acessar o sistema:\n\n` +
      `${accessLink}\n\n` +
      `⚠️ _Link válido por 1 hora._\n\n` +
      `Dúvidas? Fale comigo aqui mesmo no WhatsApp.`
    );
  }

  // 8. Notifica Soraya
  await sendWhatsApp(SORAYA_PHONE,
    `🎉 *Nova venda CRM 7Business!*\n\n` +
    `👤 *Cliente:* ${name}\n` +
    `📧 *E-mail:* ${email}\n` +
    `📱 *Telefone:* ${phone || "não informado"}\n` +
    `🆔 *Pedido:* ${orderId}\n\n` +
    `✅ Link de acesso enviado para o WhatsApp do cliente!`
  );

  console.log(`[Kiwify] ✅ Loja criada: ${email} (${userId})`);
  return NextResponse.json({ received: true, userId });
}
