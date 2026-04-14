/**
 * POST /api/webhook/ultramsg
 *
 * Webhook UltraMsg — recebe mensagens WhatsApp e:
 *  1. Cria/atualiza lead no Supabase
 *  2. Salva mensagem (schema correto: text + from_me)
 *  3. Checa ai_enabled no LEAD (handoff humano → Paulo para)
 *  4. Paulo responde com memória de conversa (histórico completo)
 *  5. Detecta [VEICULO:uuid] e envia fotos do estoque via UltraMsg
 *  6. Deduplica eventos repetidos (mesmo msgId nos últimos 30s)
 *
 * ⚠️  SQL OBRIGATÓRIO no Supabase Dashboard antes de usar handoff:
 *   ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAIReply, qualifyLead, extractLeadData, parseVehicleTag } from "@/lib/ai";

export const dynamic = "force-dynamic";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type UltraMsgBody = {
  event_type?: string;
  instanceId?: string;
  data?: {
    id?:       string;
    from?:     string;
    to?:       string;   // número de destino quando fromMe=true
    body?:     string;
    type?:     string;
    fromMe?:   boolean;
    pushname?: string;
  };
};

type StoreSettings = {
  id:                string;
  ai_enabled:        boolean | null;
  ai_name:           string | null;
  ai_personality:    string | null;
  ultramsg_instance: string | null;
  ultramsg_token:    string | null;
  notify_phone:      string | null;
};

// ── Cache de settings (5 min) ─────────────────────────────────────────────────
let _settingsCache: StoreSettings | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL   = 5 * 60 * 1000;
// Fallback: STORE_ID da variável de ambiente (evita depender só do instanceId)
const ENV_STORE_ID   = process.env.STORE_ID ?? "";

async function loadSettings(instanceId?: string | null, storeIdParam?: string | null): Promise<StoreSettings | null> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL) return _settingsCache;

  let store: StoreSettings | null = null;

  // 1ª tentativa: busca pelo instanceId enviado no body do webhook
  if (instanceId) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, ultramsg_instance, ultramsg_token, notify_phone")
      .eq("ultramsg_instance", instanceId)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
  }

  // 2ª tentativa: query param ?storeId= na URL do webhook
  if (!store && storeIdParam) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, ultramsg_instance, ultramsg_token, notify_phone")
      .eq("id", storeIdParam)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
  }

  // 3ª tentativa: STORE_ID da variável de ambiente (fallback garantido)
  if (!store && ENV_STORE_ID) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, ultramsg_instance, ultramsg_token, notify_phone")
      .eq("id", ENV_STORE_ID)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
    if (store) console.log("[UltraMsg] Settings carregadas via ENV_STORE_ID (fallback)");
  }

  if (store) {
    _settingsCache   = store;
    _settingsCacheAt = now;
  }
  return store;
}

// ── Normaliza telefone ────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  const digits = raw.replace(/^wa:/, "").split("@")[0].replace(/\D/g, "");
  // Remove DDI 55 se vier com 13 dígitos (55 + 11 dígitos)
  return digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits;
}

// ── Envia texto via UltraMsg ──────────────────────────────────────────────────
async function sendText(instance: string, token: string, to: string, body: string): Promise<void> {
  const dest = to.replace(/\D/g, "");
  const number = dest.length <= 11 ? `55${dest}` : dest;
  await fetch(`https://api.ultramsg.com/${instance}/messages/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, to: number, body }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.error("[UltraMsg] Erro texto:", e.message));
}

// ── Envia imagem via UltraMsg ─────────────────────────────────────────────────
async function sendImage(instance: string, token: string, to: string, imageUrl: string, caption = ""): Promise<void> {
  const dest = to.replace(/\D/g, "");
  const number = dest.length <= 11 ? `55${dest}` : dest;
  await fetch(`https://api.ultramsg.com/${instance}/messages/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, to: number, image: imageUrl, caption }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => console.error("[UltraMsg] Erro imagem:", e.message));
}

// ── Busca e envia fotos do veículo ────────────────────────────────────────────
async function sendVehiclePhotos(instance: string, token: string, to: string, vehicleId: string): Promise<void> {
  try {
    const { data: v } = await supabaseAdmin
      .from("vehicles")
      .select("brand, model, year, price, photos")
      .eq("id", vehicleId)
      .maybeSingle();

    if (!v || !Array.isArray(v.photos) || v.photos.length === 0) return;

    const photos  = v.photos.slice(0, 5);
    const caption = `${v.brand} ${v.model} ${v.year ?? ""}${v.price ? ` — R$ ${Number(v.price).toLocaleString("pt-BR")}` : ""}`;

    for (let i = 0; i < photos.length; i++) {
      await sendImage(instance, token, to, photos[i], i === 0 ? caption : "");
      if (i < photos.length - 1) await new Promise(r => setTimeout(r, 700));
    }
    console.log(`[UltraMsg] 📷 ${photos.length} foto(s) — ${caption}`);
  } catch (e) {
    console.error("[UltraMsg] Erro fotos:", e);
  }
}

// ── Salva mensagem no banco (schema correto: text + from_me) ──────────────────
async function saveMessage(leadId: string, text: string, fromMe: boolean, externalId?: string): Promise<void> {
  const row: Record<string, unknown> = { lead_id: leadId, text, from_me: fromMe };
  if (externalId) row.external_id = externalId;
  await supabaseAdmin.from("messages").insert(row)
    .then(({ error }) => { if (error) console.error("[UltraMsg] Erro salvar msg:", error.message); });
}

// ── Dedup: mesmo msgId nos últimos 30s ────────────────────────────────────────
const _recentIds = new Map<string, number>();

function isMemDup(id: string): boolean {
  const now = Date.now();
  for (const [k, ts] of _recentIds) { if (now - ts > 5 * 60_000) _recentIds.delete(k); }
  if (_recentIds.has(id)) return true;
  _recentIds.set(id, now);
  return false;
}

async function isDbDup(leadId: string, text: string): Promise<boolean> {
  const since = new Date(Date.now() - 30_000).toISOString();
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("text", text)
    .eq("from_me", false)
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

// Dedup por external_id no banco (serverless-safe: funciona entre instâncias)
async function isExternalIdDup(externalId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("external_id", externalId);
  return (count ?? 0) > 0;
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: UltraMsgBody;
  let rawBody: unknown;
  try {
    const text = await req.text();
    rawBody = JSON.parse(text);
    body = rawBody as UltraMsgBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { event_type, data, instanceId } = body;

  // LOG COMPLETO — diagnóstico de payload real do UltraMsg
  console.log("[UltraMsg] RAW PAYLOAD:", JSON.stringify({
    event_type,
    instanceId,
    fromMe:    data?.fromMe,
    type:      data?.type,
    from:      data?.from,
    to:        data?.to,
    body_text: (data?.body ?? "").slice(0, 80),
    id:        data?.id,
  }));

  // Aceita: message_received (cliente), message_create (vendedor via WhatsApp físico)
  const VALID_EVENTS = ["message_received", "message", "message_create"];
  if (!VALID_EVENTS.includes(event_type ?? "")) {
    console.log("[UltraMsg] Evento ignorado:", event_type);
    return NextResponse.json({ ok: true, skipped: "event", event_type });
  }
  if (!data || (data.type && data.type !== "chat")) {
    console.log("[UltraMsg] Tipo ignorado:", data?.type);
    return NextResponse.json({ ok: true, skipped: "type", msg_type: data?.type });
  }

  // ── ⚡ HANDOFF via WhatsApp físico ────────────────────────────────────────
  // message_create dispara quando o VENDEDOR envia pelo celular/WhatsApp Web.
  // fromMe=true também pode vir em message_received (ex: mensagens enviadas via API).
  if (data.fromMe) {
    const clientPhone = normalizePhone(data.to ?? "");
    const vendorMsg   = (data.body ?? "").trim();

    console.log("[UltraMsg] fromMe=true | clientPhone:", clientPhone, "| msg:", vendorMsg.slice(0, 60));

    if (clientPhone && vendorMsg) {
      const { searchParams } = new URL(req.url);
      const store = await loadSettings(instanceId, searchParams.get("storeId"));
      const storeId = store?.id ?? null;

      // Busca lead pelo telefone — tenta com e sem DDI 55 para garantir match
      const phones = [clientPhone];
      if (clientPhone.length === 11) phones.push(`55${clientPhone}`);
      if (clientPhone.startsWith("55") && clientPhone.length === 13) phones.push(clientPhone.slice(2));

      let lead: { id: string; ai_enabled: boolean } | null = null;
      for (const ph of phones) {
        let q = supabaseAdmin.from("leads").select("id, ai_enabled").eq("phone", ph);
        if (storeId) q = q.eq("store_id", storeId);
        const { data: found } = await q.maybeSingle();
        if (found) { lead = found; break; }
      }

      console.log("[UltraMsg] Lead encontrado para handoff:", lead?.id ?? "NÃO ENCONTRADO", "| phones tentados:", phones);

      if (lead) {
        await saveMessage(lead.id, vendorMsg, true, data.id);
        if (lead.ai_enabled !== false) {
          await supabaseAdmin.from("leads").update({ ai_enabled: false }).eq("id", lead.id);
          console.log(`[UltraMsg] Handoff OK → Lead ${lead.id} (${clientPhone}) — Paulo pausado`);
        } else {
          console.log(`[UltraMsg] Lead ${lead.id} já estava com Paulo pausado`);
        }
      }
    } else {
      console.log("[UltraMsg] fromMe=true mas clientPhone ou msg vazio — sem handoff");
    }
    return NextResponse.json({ ok: true, handoff: "whatsapp_native" });
  }

  const phone   = normalizePhone(data.from ?? "");
  const message = (data.body ?? "").trim();
  const msgId   = data.id ?? "";

  if (!phone || !message) return NextResponse.json({ ok: true, skipped: "empty" });

  // Dedup nível 1 (memória — rápido, mesmo processo)
  if (msgId && isMemDup(msgId)) {
    console.warn("[UltraMsg] Dup ignorada (mem):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_mem" });
  }

  // Dedup nível 1b (banco por external_id — serverless-safe, entre instâncias)
  if (msgId && await isExternalIdDup(msgId)) {
    console.warn("[UltraMsg] Dup ignorada (external_id):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_ext" });
  }

  // ── 1. Carrega settings da loja ───────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const store = await loadSettings(instanceId, searchParams.get("storeId"));
  const storeId = store?.id ?? null;

  // ── 2. Extrai + qualifica ─────────────────────────────────────────────────
  const extracted     = extractLeadData(message);
  const qualification = qualifyLead(message);

  // ── 3. Upsert lead ────────────────────────────────────────────────────────
  let q = supabaseAdmin.from("leads").select("*").eq("phone", phone);
  if (storeId) q = q.eq("store_id", storeId);
  const { data: existing } = await q.maybeSingle();

  let leadId: string;
  // leadRecord sempre aponta para o objeto completo do lead (existente ou recém-criado)
  let leadRecord: Record<string, unknown> = existing ?? {};

  if (existing) {
    leadId = existing.id;
    const upd: Record<string, unknown> = { qualification };
    if (!existing.name && data.pushname) upd.name = data.pushname;
    if (extracted.budget  && !existing.budget)  upd.budget  = extracted.budget;
    if (extracted.type    && !existing.type)     upd.type    = extracted.type;
    if (extracted.payment && !existing.payment)  upd.payment = extracted.payment;
    if (Object.keys(upd).length > 1) {
      await supabaseAdmin.from("leads").update(upd).eq("id", leadId);
      // Atualiza leadRecord local com os campos modificados
      leadRecord = { ...leadRecord, ...upd };
    }
  } else {
    const row: Record<string, unknown> = {
      phone, name: data.pushname ?? null, source: "whatsapp",
      stage: "Novo Lead", qualification,
      budget: extracted.budget ?? null, type: extracted.type ?? null,
      payment: extracted.payment ?? null,
    };
    if (storeId) row.store_id = storeId;
    const { data: nl } = await supabaseAdmin.from("leads").insert(row).select("*").single();
    leadId = nl?.id ?? "";
    // Busca objeto completo (inclui ai_enabled e demais colunas) — corrige Object.assign no-op
    const { data: fresh } = await supabaseAdmin.from("leads").select("*").eq("id", leadId).maybeSingle();
    leadRecord = (fresh as Record<string, unknown>) ?? row;
  }

  if (!leadId) return NextResponse.json({ ok: false, error: "leadId vazio" });

  // Dedup nível 2 (banco 30s)
  if (await isDbDup(leadId, message)) {
    console.warn("[UltraMsg] Dup ignorada (DB):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_db" });
  }

  // ── 4. Salva mensagem do cliente ──────────────────────────────────────────
  await saveMessage(leadId, message, false, msgId);

  // ── 5. Checa IA global (settings da loja) ─────────────────────────────────
  if (store?.ai_enabled !== true) {
    console.log("[UltraMsg] IA desativada globalmente");
    return NextResponse.json({ ok: true, ai: "disabled_global" });
  }

  if (!store.ultramsg_instance || !store.ultramsg_token) {
    console.warn("[UltraMsg] Credenciais UltraMsg ausentes na loja");
    return NextResponse.json({ ok: true, ai: "no_credentials" });
  }

  // ── 6. ⚡ HANDOFF — checa ai_enabled NO LEAD ──────────────────────────────
  // Se vendedor assumiu este lead, Paulo fica mudo.
  // leadRecord já contém o objeto completo (lead existente OU recém-criado com fresh).
  const leadAiEnabled = leadRecord.ai_enabled !== false;

  if (!leadAiEnabled) {
    console.log(`[UltraMsg] Lead ${leadId} — vendedor assumiu, Paulo pausado`);
    return NextResponse.json({ ok: true, ai: "disabled_lead" });
  }

  // ── 7. IA responde com memória de conversa ────────────────────────────────
  try {
    const leadCtx = {
      id:      leadId,
      name:    (leadRecord.name    as string | null) ?? data.pushname ?? null,
      budget:  (leadRecord.budget  as string | null) ?? extracted.budget  ?? null,
      type:    (leadRecord.type    as string | null) ?? extracted.type    ?? null,
      payment: (leadRecord.payment as string | null) ?? extracted.payment ?? null,
    };

    const rawReply = await getAIReply(
      message,
      leadCtx,
      store.ai_personality ?? null,
      store.ai_name ?? "Paulo",
    );

    if (!rawReply) return NextResponse.json({ ok: true, ai: "no_reply" });

    // ── 8. Processa tag [VEICULO:uuid] ────────────────────────────────────
    const { message: cleanReply, vehicleId } = parseVehicleTag(rawReply);

    // Envia texto
    await sendText(store.ultramsg_instance, store.ultramsg_token, phone, cleanReply);

    // Envia fotos se Paulo indicou veículo
    if (vehicleId) {
      await sendVehiclePhotos(store.ultramsg_instance, store.ultramsg_token, phone, vehicleId);
    }

    // ── 9. Salva resposta da IA ───────────────────────────────────────────
    await saveMessage(leadId, cleanReply, true);

    // ── 10. Notifica vendedor se lead Quente ──────────────────────────────
    const notifyPhone = store.notify_phone ?? "";
    if (qualification === "quente" && notifyPhone) {
      const alerta =
        `🔥 *LEAD QUENTE!*\n👤 ${data.pushname ?? phone}\n📱 ${phone}\n` +
        `💬 "${message.slice(0, 100)}"\n\n⚡ Acesse o CRM agora!`;
      await sendText(store.ultramsg_instance, store.ultramsg_token, notifyPhone, alerta);
    }

    console.log(`[UltraMsg] ${phone} [${qualification}]: "${message}" → "${cleanReply.slice(0, 60)}"`);
  } catch (e) {
    console.error("[UltraMsg] Erro IA:", e);
  }

  return NextResponse.json({ ok: true });
}
