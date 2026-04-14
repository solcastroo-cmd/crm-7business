/**
 * POST /api/webhook/zapi
 *
 * Webhook Z-API — recebe mensagens WhatsApp e:
 *  1. Cria/atualiza lead no Supabase
 *  2. Salva mensagem (schema: text + from_me)
 *  3. Checa ai_enabled no LEAD (handoff humano → Paulo para)
 *  4. Paulo responde com memória de conversa (histórico completo)
 *  5. Detecta [VEICULO:uuid] e envia fotos do estoque via Z-API
 *  6. Deduplica eventos repetidos (mesmo messageId)
 *
 * Payload Z-API (ReceivedCallback):
 *   { type, instanceId, messageId, phone, fromMe, senderName, text: { message } }
 *
 * ⚠️  SQL OBRIGATÓRIO no Supabase antes de usar:
 *   ALTER TABLE public.users
 *     ADD COLUMN IF NOT EXISTS zapi_instance text,
 *     ADD COLUMN IF NOT EXISTS zapi_token text,
 *     ADD COLUMN IF NOT EXISTS zapi_client_token text,
 *     ADD COLUMN IF NOT EXISTS zapi_phone text;
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAIReply, qualifyLead, extractLeadData, parseVehicleTag } from "@/lib/ai";

export const dynamic = "force-dynamic";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type ZApiBody = {
  instanceId?: string;
  messageId?:  string;
  phone?:      string;    // número (sempre com DDI, ex: 5511999999999)
  fromMe?:     boolean;
  momment?:    number;
  status?:     string;
  chatName?:   string;
  senderName?: string;
  type?:       string;    // "ReceivedCallback" | "SentCallback" | ...
  isGroup?:    boolean;
  text?: {
    message?: string;
  };
};

type StoreSettings = {
  id:                  string;
  ai_enabled:          boolean | null;
  ai_name:             string | null;
  ai_personality:      string | null;
  zapi_instance:       string | null;
  zapi_token:          string | null;
  zapi_client_token:   string | null;
  notify_phone:        string | null;
};

// ── Cache de settings (5 min) ─────────────────────────────────────────────────
let _settingsCache: StoreSettings | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL = 5 * 60 * 1000;
const ENV_STORE_ID = process.env.STORE_ID ?? "";

async function loadSettings(
  instanceId?: string | null,
  storeIdParam?: string | null,
): Promise<StoreSettings | null> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL) return _settingsCache;

  let store: StoreSettings | null = null;

  // 1ª tentativa: busca pelo instanceId enviado no body do webhook
  if (instanceId) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, zapi_instance, zapi_token, zapi_client_token, notify_phone")
      .eq("zapi_instance", instanceId)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
  }

  // 2ª tentativa: query param ?storeId= na URL do webhook
  if (!store && storeIdParam) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, zapi_instance, zapi_token, zapi_client_token, notify_phone")
      .eq("id", storeIdParam)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
  }

  // 3ª tentativa: STORE_ID da variável de ambiente (fallback garantido)
  if (!store && ENV_STORE_ID) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, ai_enabled, ai_name, ai_personality, zapi_instance, zapi_token, zapi_client_token, notify_phone")
      .eq("id", ENV_STORE_ID)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
    if (store) console.log("[ZAPI] Settings carregadas via ENV_STORE_ID (fallback)");
  }

  if (store) {
    _settingsCache   = store;
    _settingsCacheAt = now;
  }
  return store;
}

// ── Normaliza telefone ────────────────────────────────────────────────────────
// Z-API envia phone com DDI (ex: "5511999999999"). Remove DDI 55 p/ consistência
// com os leads salvos no banco (que usam apenas DDD+número).
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits;
}

// Formata número para envio: Z-API espera DDI completo
function formatPhoneForSend(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}

// ── Envia texto via Z-API ─────────────────────────────────────────────────────
async function sendText(
  instance: string,
  token: string,
  clientToken: string,
  to: string,
  message: string,
): Promise<void> {
  const number = formatPhoneForSend(to);
  await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Client-Token": clientToken },
    body:    JSON.stringify({ phone: number, message }),
    signal:  AbortSignal.timeout(10_000),
  }).catch((e) => console.error("[ZAPI] Erro texto:", e.message));
}

// ── Envia imagem via Z-API ────────────────────────────────────────────────────
async function sendImage(
  instance: string,
  token: string,
  clientToken: string,
  to: string,
  imageUrl: string,
  caption = "",
): Promise<void> {
  const number = formatPhoneForSend(to);
  await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-image`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Client-Token": clientToken },
    body:    JSON.stringify({ phone: number, image: imageUrl, caption }),
    signal:  AbortSignal.timeout(15_000),
  }).catch((e) => console.error("[ZAPI] Erro imagem:", e.message));
}

// ── Busca e envia fotos do veículo ────────────────────────────────────────────
async function sendVehiclePhotos(
  instance: string,
  token: string,
  clientToken: string,
  to: string,
  vehicleId: string,
): Promise<void> {
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
      await sendImage(instance, token, clientToken, to, photos[i], i === 0 ? caption : "");
      if (i < photos.length - 1) await new Promise(r => setTimeout(r, 700));
    }
    console.log(`[ZAPI] 📷 ${photos.length} foto(s) — ${caption}`);
  } catch (e) {
    console.error("[ZAPI] Erro fotos:", e);
  }
}

// ── Salva mensagem no banco ───────────────────────────────────────────────────
async function saveMessage(
  leadId: string,
  text: string,
  fromMe: boolean,
  externalId?: string,
): Promise<void> {
  const row: Record<string, unknown> = { lead_id: leadId, text, from_me: fromMe };
  if (externalId) row.external_id = externalId;
  await supabaseAdmin.from("messages").insert(row)
    .then(({ error }) => { if (error) console.error("[ZAPI] Erro salvar msg:", error.message); });
}

// ── Deduplicação ──────────────────────────────────────────────────────────────
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

async function isExternalIdDup(externalId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("external_id", externalId);
  return (count ?? 0) > 0;
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ZApiBody;
  try {
    const text = await req.text();
    body = JSON.parse(text) as ZApiBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const {
    type,
    instanceId,
    messageId,
    phone: rawPhone,
    fromMe,
    senderName,
    text: textObj,
    isGroup,
  } = body;

  // LOG COMPLETO — diagnóstico de payload real do Z-API
  console.log("[ZAPI] RAW PAYLOAD:", JSON.stringify({
    type,
    instanceId,
    fromMe,
    isGroup,
    phone:     rawPhone,
    message:   textObj?.message?.slice(0, 80),
    messageId,
  }));

  // Aceita apenas ReceivedCallback (cliente) e SentCallback (handoff do vendedor)
  const VALID_TYPES = ["ReceivedCallback", "SentCallback"];
  if (!VALID_TYPES.includes(type ?? "")) {
    console.log("[ZAPI] Tipo ignorado:", type);
    return NextResponse.json({ ok: true, skipped: "type", type });
  }

  // Ignora mensagens de grupos
  if (isGroup) {
    console.log("[ZAPI] Mensagem de grupo ignorada");
    return NextResponse.json({ ok: true, skipped: "group" });
  }

  const message = (textObj?.message ?? "").trim();
  if (!message || !rawPhone) return NextResponse.json({ ok: true, skipped: "empty" });

  const { searchParams } = new URL(req.url);

  // ── ⚡ HANDOFF via WhatsApp físico (SentCallback / fromMe=true) ───────────
  // Dispara quando o VENDEDOR envia mensagem pelo celular ou WhatsApp Web.
  if (fromMe) {
    const clientPhone = normalizePhone(rawPhone);
    console.log("[ZAPI] fromMe=true | clientPhone:", clientPhone, "| msg:", message.slice(0, 60));

    if (clientPhone && message) {
      const store   = await loadSettings(instanceId, searchParams.get("storeId"));
      const storeId = store?.id ?? null;

      // Tenta match com e sem DDI 55
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

      console.log("[ZAPI] Lead para handoff:", lead?.id ?? "NÃO ENCONTRADO", "| phones:", phones);

      if (lead) {
        await saveMessage(lead.id, message, true, messageId);
        if (lead.ai_enabled !== false) {
          await supabaseAdmin.from("leads").update({ ai_enabled: false }).eq("id", lead.id);
          console.log(`[ZAPI] Handoff OK → Lead ${lead.id} (${clientPhone}) — Paulo pausado`);
        } else {
          console.log(`[ZAPI] Lead ${lead.id} já estava com Paulo pausado`);
        }
      }
    } else {
      console.log("[ZAPI] fromMe=true mas phone ou msg vazio — sem handoff");
    }
    return NextResponse.json({ ok: true, handoff: "whatsapp_native" });
  }

  // ── Mensagem incoming do cliente ──────────────────────────────────────────
  const phone = normalizePhone(rawPhone);
  const msgId = messageId ?? "";

  if (!phone) return NextResponse.json({ ok: true, skipped: "empty_phone" });

  // Dedup nível 1 (memória — mesmo processo)
  if (msgId && isMemDup(msgId)) {
    console.warn("[ZAPI] Dup ignorada (mem):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_mem" });
  }

  // Dedup nível 2 (banco por external_id — serverless-safe)
  if (msgId && await isExternalIdDup(msgId)) {
    console.warn("[ZAPI] Dup ignorada (external_id):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_ext" });
  }

  // ── 1. Carrega settings da loja ───────────────────────────────────────────
  const store   = await loadSettings(instanceId, searchParams.get("storeId"));
  const storeId = store?.id ?? null;

  // ── 2. Extrai + qualifica ─────────────────────────────────────────────────
  const extracted     = extractLeadData(message);
  const qualification = qualifyLead(message);

  // ── 3. Upsert lead ────────────────────────────────────────────────────────
  let q = supabaseAdmin.from("leads").select("*").eq("phone", phone);
  if (storeId) q = q.eq("store_id", storeId);
  const { data: existing } = await q.maybeSingle();

  let leadId: string;
  let leadRecord: Record<string, unknown> = existing ?? {};

  if (existing) {
    leadId = existing.id;
    const upd: Record<string, unknown> = { qualification };
    if (!existing.name && senderName)  upd.name    = senderName;
    if (extracted.budget  && !existing.budget)  upd.budget  = extracted.budget;
    if (extracted.type    && !existing.type)    upd.type    = extracted.type;
    if (extracted.payment && !existing.payment) upd.payment = extracted.payment;
    if (Object.keys(upd).length > 1) {
      await supabaseAdmin.from("leads").update(upd).eq("id", leadId);
      leadRecord = { ...leadRecord, ...upd };
    }
  } else {
    const row: Record<string, unknown> = {
      phone, name: senderName ?? null, source: "whatsapp",
      stage: "Novo Lead", qualification,
      budget: extracted.budget ?? null, type: extracted.type ?? null,
      payment: extracted.payment ?? null,
    };
    if (storeId) row.store_id = storeId;
    const { data: nl } = await supabaseAdmin.from("leads").insert(row).select("*").single();
    leadId = nl?.id ?? "";
    const { data: fresh } = await supabaseAdmin.from("leads").select("*").eq("id", leadId).maybeSingle();
    leadRecord = (fresh as Record<string, unknown>) ?? row;
  }

  if (!leadId) return NextResponse.json({ ok: false, error: "leadId vazio" });

  // Dedup nível 3 (banco 30s por texto)
  if (await isDbDup(leadId, message)) {
    console.warn("[ZAPI] Dup ignorada (DB):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_db" });
  }

  // ── 4. Salva mensagem do cliente ──────────────────────────────────────────
  await saveMessage(leadId, message, false, msgId);

  // ── 5. Checa IA global (settings da loja) ─────────────────────────────────
  if (store?.ai_enabled !== true) {
    console.log("[ZAPI] IA desativada globalmente");
    return NextResponse.json({ ok: true, ai: "disabled_global" });
  }

  if (!store.zapi_instance || !store.zapi_token || !store.zapi_client_token) {
    console.warn("[ZAPI] Credenciais Z-API ausentes na loja");
    return NextResponse.json({ ok: true, ai: "no_credentials" });
  }

  // ── 6. ⚡ HANDOFF — checa ai_enabled NO LEAD ──────────────────────────────
  const leadAiEnabled = leadRecord.ai_enabled !== false;
  if (!leadAiEnabled) {
    console.log(`[ZAPI] Lead ${leadId} — vendedor assumiu, Paulo pausado`);
    return NextResponse.json({ ok: true, ai: "disabled_lead" });
  }

  // ── 7. IA responde com memória de conversa ────────────────────────────────
  try {
    const leadCtx = {
      id:      leadId,
      name:    (leadRecord.name    as string | null) ?? senderName ?? null,
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
    await sendText(store.zapi_instance, store.zapi_token, store.zapi_client_token, phone, cleanReply);

    // Envia fotos se Paulo indicou veículo
    if (vehicleId) {
      await sendVehiclePhotos(store.zapi_instance, store.zapi_token, store.zapi_client_token, phone, vehicleId);
    }

    // ── 9. Salva resposta da IA ───────────────────────────────────────────
    await saveMessage(leadId, cleanReply, true);

    // ── 10. Notifica vendedor se lead Quente ──────────────────────────────
    const notifyPhone = store.notify_phone ?? "";
    if (qualification === "quente" && notifyPhone) {
      const alerta =
        `🔥 *LEAD QUENTE!*\n👤 ${senderName ?? phone}\n📱 ${phone}\n` +
        `💬 "${message.slice(0, 100)}"\n\n⚡ Acesse o CRM agora!`;
      await sendText(store.zapi_instance, store.zapi_token, store.zapi_client_token, notifyPhone, alerta);
    }

    console.log(`[ZAPI] ${phone} [${qualification}]: "${message}" → "${cleanReply.slice(0, 60)}"`);
  } catch (e) {
    console.error("[ZAPI] Erro IA:", e);
  }

  return NextResponse.json({ ok: true });
}
