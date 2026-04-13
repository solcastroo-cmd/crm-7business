/**
 * POST /api/webhook/ultramsg
 * Recebe mensagens do UltraMsg → cria/atualiza lead → responde via IA (se habilitado)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAIReply, qualifyLead, extractLeadData } from "@/lib/ai";

export const dynamic = "force-dynamic";

type UltraMsgWebhook = {
  event_type?: string;
  instanceId?:  string;
  data?: {
    id?:       string;
    from?:     string;
    to?:       string;
    body?:     string;
    type?:     string;
    fromMe?:   boolean;
    pushname?: string;
    timestamp?: number;
  };
};

type StoreSettings = {
  id:               string;
  ai_enabled:       boolean | null;
  ai_name:          string | null;
  ai_personality:   string | null;
  ultramsg_instance: string | null;
  ultramsg_token:    string | null;
};

/** Envia mensagem de volta via UltraMsg API */
async function sendUltraMsg(
  instance: string,
  token:    string,
  to:       string,
  body:     string,
): Promise<void> {
  const phone = to.includes("@") ? to.split("@")[0] : to;
  // UltraMsg espera número com DDI: se for 11 dígitos BR, adiciona 55
  const dest = phone.length === 11 && !phone.startsWith("55") ? `55${phone}` : phone;

  await fetch(`https://api.ultramsg.com/${instance}/messages/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, to: dest, body }),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function POST(req: NextRequest) {
  let body: UltraMsgWebhook;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const { event_type, data, instanceId } = body;

  // Só processa mensagens recebidas (não enviadas)
  if (event_type !== "message_received" && event_type !== "message") {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (!data || data.fromMe) return NextResponse.json({ ok: true, skipped: true });
  // Só processa mensagens de texto
  if (data.type && data.type !== "chat") return NextResponse.json({ ok: true, skipped: true });

  // LEAD-03: normaliza telefone — strip "wa:", "@c.us", DDI 55
  const rawPhone = (data.from ?? "").replace(/^wa:/, "").split("@")[0].replace(/[^0-9]/g, "");
  const phone = rawPhone.length === 13 && rawPhone.startsWith("55")
    ? rawPhone.slice(2)
    : rawPhone;
  if (!phone) return NextResponse.json({ ok: true, skipped: true });

  const pushname = data.pushname ?? null;
  const message  = data.body ?? "";

  // ── 1. Descobre a loja: instanceId → fallback query param ?storeId ───────────
  // LEAD-01: configure a URL do webhook no UltraMsg como:
  //   https://crm-7business-production.up.railway.app/api/webhook/ultramsg?storeId=SEU_UUID
  const { searchParams } = new URL(req.url);
  const storeIdParam = searchParams.get("storeId") ?? null;

  let store: StoreSettings | null = null;

  // Tenta pelo instanceId primeiro
  if (instanceId) {
    const { data: u } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, ultramsg_instance, ultramsg_token")
      .eq("ultramsg_instance", instanceId)
      .maybeSingle<StoreSettings>();
    store = u ?? null;
  }

  // Fallback: usa ?storeId da URL do webhook
  if (!store && storeIdParam) {
    const { data: u } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, ultramsg_instance, ultramsg_token")
      .eq("id", storeIdParam)
      .maybeSingle<StoreSettings>();
    store = u ?? null;
  }

  const storeId = store?.id ?? null;

  // ── 2. Extrai dados do lead a partir da mensagem ─────────────────────────────
  const extracted    = extractLeadData(message);
  const qualification = qualifyLead(message);

  // ── 3. Busca lead existente ──────────────────────────────────────────────────
  // BUG-WA-01: query = query.eq() — reassign obrigatório
  let q = supabaseAdmin.from("leads").select("id, stage, name, budget, type, payment").eq("phone", phone);
  if (storeId) q = q.eq("store_id", storeId);
  const { data: existing } = await q.maybeSingle();

  let leadId: string;

  if (existing) {
    leadId = existing.id;

    // Atualiza campos extraídos + qualificação
    const upd: Record<string, unknown> = { qualification, updated_at: new Date().toISOString() };
    if (!existing.name && pushname) upd.name = pushname;
    if (extracted.budget  && !existing.budget)  upd.budget  = extracted.budget;
    if (extracted.type    && !existing.type)     upd.type    = extracted.type;
    if (extracted.payment && !existing.payment)  upd.payment = extracted.payment;

    await supabaseAdmin.from("leads").update(upd).eq("id", leadId);
  } else {
    // Cria novo lead
    const leadData: Record<string, unknown> = {
      phone,
      name:          pushname ?? null,
      source:        "whatsapp",
      stage:         "Novo Lead",
      qualification,
      budget:        extracted.budget  ?? null,
      type:          extracted.type    ?? null,
      payment:       extracted.payment ?? null,
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    };
    if (storeId) leadData.store_id = storeId;

    const { data: newLead } = await supabaseAdmin
      .from("leads").insert(leadData).select("id").single();
    leadId = newLead?.id ?? "";
  }

  // ── 4. Registra mensagem recebida ────────────────────────────────────────────
  if (leadId) {
    await supabaseAdmin.from("messages").insert({
      lead_id:    leadId,
      direction:  "in",
      content:    message,
      source:     "ultramsg",
      created_at: new Date().toISOString(),
    });
  }

  // ── 5. Resposta automática via IA ────────────────────────────────────────────
  const aiEnabled = store?.ai_enabled === true;

  if (aiEnabled && leadId && store?.ultramsg_instance && store?.ultramsg_token && message.trim()) {
    try {
      // Monta contexto do lead para a IA
      const leadCtx = {
        name:    existing?.name ?? pushname ?? null,
        budget:  existing?.budget ?? extracted.budget ?? null,
        type:    existing?.type   ?? extracted.type   ?? null,
        payment: existing?.payment ?? extracted.payment ?? null,
      };

      const aiReply = await getAIReply(
        message,
        leadCtx,
        store.ai_personality ?? null,
        store.ai_name ?? "Paulo",
      );

      if (aiReply) {
        // Envia resposta via UltraMsg
        await sendUltraMsg(
          store.ultramsg_instance,
          store.ultramsg_token,
          data.from ?? phone,
          aiReply,
        );

        // Loga mensagem enviada
        await supabaseAdmin.from("messages").insert({
          lead_id:    leadId,
          direction:  "out",
          content:    aiReply,
          source:     "ultramsg_ai",
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      // IA nunca deve travar o webhook — apenas loga
      console.error("[Webhook/UltraMsg] Erro na resposta IA:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
