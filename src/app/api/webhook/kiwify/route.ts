/**
 * POST /api/webhook/kiwify
 * Recebe evento de compra confirmada da Kiwify e provisiona
 * automaticamente uma nova loja (usuário) no CRM 7Business.
 *
 * Usa supabaseAdmin.auth.admin.inviteUserByEmail para criar o usuário
 * e disparar o e-mail de convite automaticamente via SMTP do Supabase.
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

async function notifySoraya(message: string) {
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) return;
  try {
    await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({ number: SORAYA_PHONE, textMessage: { text: message } }),
    });
  } catch { /* silencia */ }
}

export async function POST(req: NextRequest) {
  // 1. Valida token
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
    console.warn("[Kiwify] Token inválido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  console.log("[Kiwify] Payload recebido:", JSON.stringify(body).slice(0, 300));

  // 2. Só processa compras pagas
  const order    = body.order    as Record<string, unknown> | undefined;
  const customer = body.Customer as Record<string, unknown> | undefined;
  const status   = (order?.status as string | undefined)?.toLowerCase();

  if (status !== "paid" && status !== "approved") {
    console.log(`[Kiwify] Status ignorado: ${status}`);
    return NextResponse.json({ received: true, skipped: true });
  }

  const email   = (customer?.email  as string | undefined)?.toLowerCase().trim() ?? "";
  const name    = (customer?.name   as string | undefined)?.trim()                ?? "Cliente";
  const phone   = (customer?.mobile as string | undefined)?.replace(/\D/g, "")   ?? "";
  const orderId = (order?.id        as string | undefined) ?? "";

  if (!email) {
    console.error("[Kiwify] E-mail ausente no payload");
    return NextResponse.json({ error: "E-mail ausente" }, { status: 400 });
  }

  console.log(`[Kiwify] Compra confirmada: ${email} — pedido ${orderId}`);

  // 3. Idempotência — checa se já existe
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const alreadyExists = existing?.users?.some(u => u.email === email);
  if (alreadyExists) {
    console.log(`[Kiwify] Usuário já existe: ${email}`);
    return NextResponse.json({ received: true, skipped: true });
  }

  // 4. Convida usuário — Supabase envia o e-mail automaticamente
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${CRM_URL}/login`,
      data: { name, kiwify_order_id: orderId },
    }
  );

  if (inviteError || !inviteData?.user) {
    console.error("[Kiwify] Erro ao convidar usuário:", inviteError?.message);
    return NextResponse.json({ error: "Falha ao criar usuário" }, { status: 500 });
  }

  const userId = inviteData.user.id;

  // 5. Cria row na tabela users
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
    console.error("[Kiwify] Erro ao salvar no banco:", dbError.message);
  }

  // 6. Notifica Soraya no WhatsApp
  await notifySoraya(
    `🎉 *Nova venda CRM 7Business!*\n\n` +
    `👤 *Cliente:* ${name}\n` +
    `📧 *E-mail:* ${email}\n` +
    `📱 *Telefone:* ${phone || "não informado"}\n` +
    `🆔 *Pedido:* ${orderId}\n\n` +
    `✅ Convite enviado automaticamente para o e-mail do cliente!`
  );

  console.log(`[Kiwify] ✅ Convite enviado para ${email} (userId: ${userId})`);
  return NextResponse.json({ received: true, userId });
}
