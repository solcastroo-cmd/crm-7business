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

import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAIReply, qualifyLead, extractLeadData, parseVehicleTag } from "@/lib/ai";
import { analyzeLead, applyProfile, resolveAdVehicle } from "@/lib/leadIntel";
import {
  sendCAPIInitiateConversation,
  sendCAPILeadEvent,
  sendCAPIQualifiedLeadEvent,
  calcLeadScore,
  QUALIFIED_MIN_SCORE,
  type CAPIUserData,
} from "@/lib/capi";

export const dynamic = "force-dynamic";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type ZApiBody = {
  instanceId?: string;
  messageId?:  string;
  phone?:      string;
  fromMe?:     boolean;
  momment?:    number;
  status?:     string;
  chatName?:   string;
  senderName?: string;
  type?:       string;
  isGroup?:    boolean;
  text?: {
    message?: string;
  };
  // Anúncio Click-to-WhatsApp: a Z-API entrega na primeira mensagem do clique,
  // no nível raiz do payload (sourceId = ID do anúncio no Meta).
  externalAdReply?: {
    title?:       string;
    body?:        string;
    mediaType?:   string;
    thumbnailUrl?: string;
    sourceType?:  string;
    sourceId?:    string;
    sourceUrl?:   string;
    ctwaClid?:    string;
  };
  // Formato legado (mantido como fallback)
  referral?: {
    source_url?:  string;
    headline?:    string;
    body?:        string;
    media_url?:   string;
    ctwa_clid?:   string;
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

// ── Cache de settings por loja (30s TTL) — multi-tenant safe ─────────────────
const SETTINGS_TTL = 30 * 1000;
const ENV_STORE_ID = process.env.STORE_ID ?? "";

type CacheEntry = { store: StoreSettings; cachedAt: number };
const _settingsCache = new Map<string, CacheEntry>();

async function loadSettings(
  instanceId?: string | null,
  storeIdParam?: string | null,
): Promise<StoreSettings | null> {
  const now    = Date.now();
  const cacheKey = instanceId ?? storeIdParam ?? ENV_STORE_ID;

  // Verifica cache pela chave da loja
  const cached = cacheKey ? _settingsCache.get(cacheKey) : undefined;
  if (cached && now - cached.cachedAt < SETTINGS_TTL) return cached.store;

  const FIELDS = "id, ai_enabled, ai_name, ai_personality, zapi_instance, zapi_token, zapi_client_token, notify_phone";
  let store: StoreSettings | null = null;

  // 1ª tentativa: busca pelo instanceId enviado no body do webhook
  if (instanceId) {
    const { data } = await supabaseAdmin
      .from("users").select(FIELDS)
      .eq("zapi_instance", instanceId)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
  }

  // 2ª tentativa: query param ?storeId= na URL do webhook
  if (!store && storeIdParam) {
    const { data } = await supabaseAdmin
      .from("users").select(FIELDS)
      .eq("id", storeIdParam)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
  }

  // 3ª tentativa: STORE_ID da variável de ambiente (fallback PH Autoscar)
  if (!store && ENV_STORE_ID) {
    const { data } = await supabaseAdmin
      .from("users").select(FIELDS)
      .eq("id", ENV_STORE_ID)
      .maybeSingle<StoreSettings>();
    store = data ?? null;
    if (store) console.log("[ZAPI] Settings via ENV_STORE_ID (fallback)");
  }

  if (store && cacheKey) {
    _settingsCache.set(cacheKey, { store, cachedAt: now });
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

// ── Envia texto via Z-API (retorna messageId para dedup do SentCallback) ──────
async function sendText(
  instance: string,
  token: string,
  clientToken: string,
  to: string,
  message: string,
): Promise<string | null> {
  const number = formatPhoneForSend(to);
  try {
    const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body:    JSON.stringify({ phone: number, message }),
      signal:  AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => null);
    return (data?.messageId as string) ?? null;
  } catch (e) {
    console.error("[ZAPI] Erro texto:", (e as Error).message);
    return null;
  }
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
// Usa INSERT simples — o índice único parcial em external_id (WHERE IS NOT NULL)
// garante que duplicatas sejam rejeitadas pelo Postgres. O upsert com onConflict
// não funciona com índice parcial (PostgREST exige constraint completa).
async function saveMessage(
  leadId: string,
  text: string,
  fromMe: boolean,
  externalId?: string,
): Promise<void> {
  const row: Record<string, unknown> = { lead_id: leadId, text, from_me: fromMe };
  if (externalId) row.external_id = externalId;
  await supabaseAdmin.from("messages").insert(row)
    .then(({ error }) => {
      if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
        console.error("[ZAPI] Erro salvar msg:", error.message);
      }
    });
}

// ── Deduplicação ──────────────────────────────────────────────────────────────
const _recentIds = new Map<string, number>();

// ── CAPI: leads que já receberam evento QualifiedLead (dedup em memória) ──────
// Persiste durante o ciclo de vida do processo — previne duplo disparo na sessão.
// Para persistência cross-deploy, rodar SQL:
//   ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_sent_at timestamptz;
const _capiSentLeads = new Set<string>();

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

// ── Inteligência pós-mensagem ─────────────────────────────────────────────────
// Perfil do lead (IA), eventos para o Meta e alerta ao vendedor — tudo fora do
// caminho da resposta ao cliente. Sem GROQ_API_KEY/falha da IA, cai no score por
// palavra-chave (comportamento anterior).
async function runLeadIntel(ctx: {
  leadId:       string;
  phone:        string;
  name:         string | null;
  payment:      string | null;
  vehicle:      string | null;
  kwScore:      number;
  kwHot:        boolean;
  relevant:     boolean;
  store:        StoreSettings | null;
  capiUserData: CAPIUserData;
  capiOpts:     { leadId: string; storeId?: string; adId?: string };
}): Promise<void> {
  const { leadId, capiUserData, capiOpts, store } = ctx;

  // Privacidade: o número da loja recebe conversas pessoais/internas. Só analisa (e só manda
  // texto para a IA) se veio de anúncio ou se a mensagem tem cara de compra de carro.
  if (!ctx.relevant) return;

  const profile = await analyzeLead(leadId);
  let score      = ctx.kwScore;
  let interested = ctx.kwHot;
  if (profile) {
    const applied = await applyProfile(leadId, profile, ctx.payment);
    score      = applied.score;
    interested = applied.temperature !== "frio";
    console.log(`[INTEL] lead:${leadId} intent:${profile.intent} score:${score} temp:${applied.temperature}`);
  }

  // Meta CAPI: Lead = demonstrou interesse real; QualifiedLead = comprador provável
  if (interested && !_capiSentLeads.has(`${leadId}_Lead`)) {
    _capiSentLeads.add(`${leadId}_Lead`);
    await sendCAPILeadEvent(capiUserData, leadId, { ...capiOpts, score }).catch(
      (e) => console.error("[CAPI] Erro Lead:", e),
    );
  }
  const qualified = score >= QUALIFIED_MIN_SCORE;
  if (qualified && !_capiSentLeads.has(`${leadId}_QualifiedLead`)) {
    _capiSentLeads.add(`${leadId}_QualifiedLead`);
    await sendCAPIQualifiedLeadEvent(capiUserData, leadId, score, capiOpts).catch(
      (e) => console.error("[CAPI] Erro QualifiedLead:", e),
    );
    console.log(`[CAPI] 🎯 QualifiedLead — lead:${leadId} score:${score}`);
  }

  // Alerta ao vendedor: uma vez por lead, só quando qualifica (antes disparava a cada mensagem "quente")
  if (qualified && store?.notify_phone && store.zapi_instance && store.zapi_token && store.zapi_client_token) {
    const { data: claimed } = await supabaseAdmin
      .from("leads")
      .update({ hot_alerted_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("hot_alerted_at", null)
      .select("id");
    if (claimed && claimed.length > 0) {
      const alerta = [
        `🔥 *LEAD QUALIFICADO* (score ${score})`,
        `👤 ${ctx.name ?? ctx.phone}`,
        `📱 https://wa.me/55${ctx.phone}`,
        ctx.vehicle ? `🚗 ${ctx.vehicle}` : null,
        profile?.summary     ? `📌 ${profile.summary}`     : null,
        profile?.next_action ? `👉 ${profile.next_action}` : null,
        `⚡ Chame agora — intenção de compra real.`,
      ].filter(Boolean).join("\n");
      await sendText(store.zapi_instance, store.zapi_token, store.zapi_client_token, store.notify_phone, alerta);
    }
  }
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
    referral,
    externalAdReply,
  } = body;

  // ── Origem do anúncio (Click-to-WhatsApp) ────────────────────────────────
  // A Z-API manda externalAdReply só na 1ª mensagem do clique. sourceId = ID do
  // anúncio no Meta (chave para cruzar com gasto/campanha); ctwaClid = ID do clique.
  const sourceUrl = externalAdReply?.sourceUrl ?? referral?.source_url ?? "";
  const ctwaClid  = externalAdReply?.ctwaClid  ?? referral?.ctwa_clid  ?? null;
  const adId      = externalAdReply?.sourceId ? String(externalAdReply.sourceId) : null;
  const adHeadline = externalAdReply?.title ?? referral?.headline ?? null;
  const adReferral = externalAdReply ?? null;
  if (externalAdReply) {
    console.log("[ZAPI] externalAdReply:", JSON.stringify(externalAdReply).slice(0, 400));
  }
  const utmParams  = (() => {
    const isAd = !!(sourceUrl || adId);
    try {
      const url = new URL(sourceUrl.includes("?") ? sourceUrl : `https://x.com?${sourceUrl}`);
      return {
        utm_source:   url.searchParams.get("utm_source")   ?? (isAd ? "meta" : null),
        utm_campaign: url.searchParams.get("utm_campaign")  ?? null,
        utm_medium:   url.searchParams.get("utm_medium")    ?? null,
        utm_adset:    url.searchParams.get("utm_adset")     ?? null,
        utm_ad:       url.searchParams.get("utm_ad")        ?? null,
        fbclid:       url.searchParams.get("fbclid")        ?? null,
      };
    } catch {
      return { utm_source: isAd ? "meta" : null, utm_campaign: null, utm_medium: null, utm_adset: null, utm_ad: null, fbclid: null };
    }
  })();
  const adFields: Record<string, unknown> = {
    ...(adId       ? { ad_id: adId }                   : {}),
    ...(ctwaClid   ? { ctwa_clid: ctwaClid }           : {}),
    ...(adHeadline ? { ad_headline: adHeadline }       : {}),
    ...(sourceUrl  ? { ad_source_url: sourceUrl }      : {}),
    ...(adReferral ? { ad_referral: adReferral }       : {}),
  };
  // Liga o anúncio ao carro do estoque (tabela meta_ads, ou marca+modelo+ano no texto)
  if (adId) {
    const veh = await resolveAdVehicle(adId, externalAdReply?.title ?? null, externalAdReply?.body ?? null);
    if (veh) {
      if (veh.id) adFields.veiculo_interesse_id = veh.id;
      adFields.vehicle_name = veh.label;
    }
  }

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

  // Ignora o assistente "Meta AI" do WhatsApp Business: manda avisos e perguntas de verificação
  // para o número da loja, não é cliente (e não deve receber resposta da IA nem virar lead)
  if (senderName && /^meta ai$/i.test(senderName.trim())) {
    console.log("[ZAPI] Mensagem do Meta AI ignorada");
    return NextResponse.json({ ok: true, skipped: "meta_ai" });
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
  // ⚠️ Z-API também dispara SentCallback para mensagens enviadas pela IA via API.
  //    Para não auto-desativar a IA, verificamos se o messageId já está no banco
  //    (salvo pela própria IA no fluxo normal) antes de processar o handoff.
  if (fromMe) {
    const clientPhone = normalizePhone(rawPhone);
    console.log("[ZAPI] fromMe=true | clientPhone:", clientPhone, "| msg:", message.slice(0, 60));

    // Verifica se é SentCallback de mensagem enviada pela IA (já existe no banco)
    if (messageId && await isExternalIdDup(messageId)) {
      console.log("[ZAPI] SentCallback ignorado — mensagem já salva pela IA:", messageId);
      return NextResponse.json({ ok: true, skipped: "ai_sent_callback" });
    }

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
        // SentCallback de texto que a própria loja/IA acabou de enviar (external_id ainda não salvo): não é handoff
        const { count: sameText } = await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .eq("from_me", true)
          .eq("text", message)
          .gte("created_at", new Date(Date.now() - 120_000).toISOString());
        if ((sameText ?? 0) > 0) {
          console.log("[ZAPI] SentCallback ignorado — texto igual ao enviado há instantes:", lead.id);
          return NextResponse.json({ ok: true, skipped: "own_message" });
        }

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
  // .limit(1) + order evita erro "multiple rows" do maybeSingle() caso existam
  // leads duplicados legados — sempre retorna o mais antigo (o com histórico real).
  const buildLeadQuery = () => {
    let q = supabaseAdmin.from("leads").select("*").eq("phone", phone);
    if (storeId) q = q.eq("store_id", storeId);
    return q;
  };
  const { data: existing } = await buildLeadQuery()
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let leadId: string;
  let leadRecord: Record<string, unknown> = existing ?? {};

  const isNewLead = !existing;

  if (existing) {
    leadId = existing.id;
    const upd: Record<string, unknown> = { qualification };
    if (!existing.name && senderName)              upd.name         = senderName;
    if (extracted.budget  && !existing.budget)     upd.budget       = extracted.budget;
    if (extracted.type    && !existing.type)       upd.type         = extracted.type;
    if (extracted.payment && !existing.payment)    upd.payment      = extracted.payment;
    // Salva UTMs só se ainda não estiver preenchido
    if (utmParams.utm_source   && !existing.utm_source)   upd.utm_source   = utmParams.utm_source;
    if (utmParams.utm_campaign && !existing.utm_campaign) upd.utm_campaign = utmParams.utm_campaign;
    if (utmParams.utm_medium   && !existing.utm_medium)   upd.utm_medium   = utmParams.utm_medium;
    if (utmParams.utm_adset    && !existing.utm_adset)    upd.utm_adset    = utmParams.utm_adset;
    if (utmParams.utm_ad       && !existing.utm_ad)       upd.utm_ad       = utmParams.utm_ad;
    if (utmParams.fbclid       && !existing.fbclid)       upd.fbclid       = utmParams.fbclid;
    // Atribuição de anúncio: primeiro toque vence (só preenche se o lead ainda não tem)
    if (adId && !existing.ad_id) {
      Object.assign(upd, adFields);
      if (existing.veiculo_interesse_id) delete upd.veiculo_interesse_id;  // não sobrescreve escolha manual
    }
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
      utm_source:   utmParams.utm_source   ?? null,
      utm_campaign: utmParams.utm_campaign ?? null,
      utm_medium:   utmParams.utm_medium   ?? null,
      utm_adset:    utmParams.utm_adset    ?? null,
      utm_ad:       utmParams.utm_ad       ?? null,
      fbclid:       utmParams.fbclid       ?? null,
      ...adFields,
    };
    if (storeId) row.store_id = storeId;
    const { data: nl, error: insertErr } = await supabaseAdmin.from("leads").insert(row).select("*").single();

    if (insertErr && (insertErr.code === "23505" || insertErr.message.includes("duplicate") || insertErr.message.includes("unique"))) {
      console.warn("[ZAPI] Race condition em lead — buscando existente:", phone);
      const { data: raceEx } = await buildLeadQuery()
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      leadId = raceEx?.id ?? "";
      leadRecord = (raceEx as Record<string, unknown>) ?? {};
    } else {
      leadId = nl?.id ?? "";
      leadRecord = (nl as Record<string, unknown>) ?? row;
    }
  }

  if (!leadId) return NextResponse.json({ ok: false, error: "leadId vazio" });

  // ── CAPI + Score ──────────────────────────────────────────────────────────
  // User data enriquecido para melhor Event Match Quality
  const capiUserData: CAPIUserData = {
    phone,
    name:      (leadRecord.name as string | null) ?? senderName ?? null,
    fbclid:    (leadRecord.fbclid as string | null) ?? utmParams.fbclid ?? null,
    fbclidTs:  Math.floor(Date.now() / 1000),
  };
  const capiOpts = {
    leadId,
    storeId: storeId ?? undefined,
    adId:    (leadRecord.ad_id as string | null) ?? adId ?? undefined,
  };

  // InitiateConversation — apenas para leads novos (primeira mensagem)
  if (isNewLead) {
    sendCAPIInitiateConversation(capiUserData, leadId, capiOpts).catch(
      (e) => console.error("[CAPI] Erro InitiateConversation:", e),
    );
    console.log(`[CAPI] 💬 InitiateConversation — lead:${leadId}`);
  }

  // Carrega histórico para calcular score acumulado
  const { data: msgHistory } = await supabaseAdmin
    .from("messages")
    .select("text")
    .eq("lead_id", leadId)
    .eq("from_me", false)
    .order("created_at", { ascending: true })
    .limit(50);

  const allClientMsgs = [
    ...(msgHistory ?? []).map(m => m.text ?? ""),
    message,
  ];
  const score = calcLeadScore(allClientMsgs);

  // Score por palavra-chave: só vale enquanto a análise da IA não rodou.
  // Depois dela, o score do lead vem do perfil (runLeadIntel) e não é sobrescrito aqui.
  if (!leadRecord.ai_analyzed_at) {
    supabaseAdmin.from("leads").update({ score }).eq("id", leadId).then(() => {});
  }

  // Dedup nível 3 (banco 30s por texto)
  if (await isDbDup(leadId, message)) {
    console.warn("[ZAPI] Dup ignorada (DB):", msgId);
    return NextResponse.json({ ok: true, skipped: "dup_db" });
  }

  // ── 4. Salva mensagem do cliente ──────────────────────────────────────────
  await saveMessage(leadId, message, false, msgId);

  // ── 4b. Inteligência do lead (comprador x curioso) — roda após a resposta ──
  after(() =>
    runLeadIntel({
      leadId,
      phone,
      name:      (leadRecord.name as string | null) ?? senderName ?? null,
      payment:   (leadRecord.payment as string | null) ?? null,
      vehicle:   (leadRecord.vehicle_name as string | null) ?? null,
      kwScore:   score,
      kwHot:     qualification === "quente",
      relevant:  !!(leadRecord.ad_id ?? adId) || qualification !== "frio" || score > 0,
      store,
      capiUserData,
      capiOpts,
    }).catch((e) => console.error("[INTEL] Erro:", e)),
  );

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

  // ── 6b. Só atende sozinho quem tem cara de cliente ─────────────────────────
  // O número da loja também recebe conversa pessoal/interna. Atende se veio de anúncio,
  // se a mensagem (ou o histórico) tem sinal de compra de carro ou se a IA já analisou o lead.
  const relevantForAI =
    !!(leadRecord.ad_id ?? adId) || qualification !== "frio" || score > 0 || !!leadRecord.ai_analyzed_at;
  if (!relevantForAI) {
    console.log(`[ZAPI] Lead ${leadId} sem sinal de compra — Paulo não responde (fica para o vendedor)`);
    return NextResponse.json({ ok: true, ai: "not_relevant" });
  }

  // ── 7. IA responde com memória de conversa ────────────────────────────────
  try {
    const leadCtx = {
      id:                   leadId,
      name:                 (leadRecord.name    as string | null) ?? senderName ?? null,
      budget:               (leadRecord.budget  as string | null) ?? extracted.budget  ?? null,
      type:                 (leadRecord.type    as string | null) ?? extracted.type    ?? null,
      payment:              (leadRecord.payment as string | null) ?? extracted.payment ?? null,
      veiculo_interesse_id: (leadRecord.veiculo_interesse_id as string | null) ?? null,
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

    // Releitura: se o vendedor assumiu enquanto a IA gerava a resposta, não envia nada
    const { data: fresh } = await supabaseAdmin
      .from("leads").select("ai_enabled").eq("id", leadId).maybeSingle();
    if (fresh?.ai_enabled === false) {
      console.log(`[ZAPI] Lead ${leadId} — vendedor assumiu durante a geração, resposta descartada`);
      return NextResponse.json({ ok: true, ai: "handoff_during_generation" });
    }

    // Envia texto — captura messageId para salvar como external_id (previne SentCallback dup)
    const sentMsgId = await sendText(store.zapi_instance, store.zapi_token, store.zapi_client_token, phone, cleanReply);

    // Envia fotos se Paulo indicou veículo
    if (vehicleId) {
      await sendVehiclePhotos(store.zapi_instance, store.zapi_token, store.zapi_client_token, phone, vehicleId);
    }

    // ── 9. Salva resposta da IA com external_id — SentCallback detecta e ignora ─
    await saveMessage(leadId, cleanReply, true, sentMsgId ?? undefined);

    console.log(`[ZAPI] ${phone} [${qualification}]: "${message}" → "${cleanReply.slice(0, 60)}"`);
  } catch (e) {
    console.error("[ZAPI] Erro IA:", e);
  }

  return NextResponse.json({ ok: true });
}
