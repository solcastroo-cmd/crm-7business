/**
 * 📱 Evolution API Webhook (WhatsApp via QR Code)
 * POST /api/webhook/evolution
 *
 * Fluxo:
 *  1. Recebe mensagem do cliente via WhatsApp
 *  2. Carrega configurações da loja (ai_personality, ai_name, ai_enabled, notify_phone)
 *  3. Extrai dados do lead (orçamento, tipo, pagamento, nome)
 *  4. Qualifica como Quente / Morno / Frio via IA
 *  5. Salva/atualiza lead no Supabase com qualification
 *  6. Salva mensagem do cliente na tabela messages
 *  7. IA responde usando a personalidade configurada nas Settings (ou padrão)
 *  8. Se Quente → notifica vendedor via WhatsApp
 */

import { NextRequest } from "next/server";
import { upsertLead } from "@/lib/leads";
import { getAIReply, extractLeadData, qualifyLead, parseVehicleTag } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseAdReferral } from "@/lib/adReferral";
import {
  sendCAPIInitiateConversation,
  sendCAPILeadEvent,
  sendCAPIQualifiedLeadEvent,
  calcLeadScore,
  type CAPIUserData,
} from "@/lib/capi";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL  ?? "";
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR";
const STORE_ID           = process.env.STORE_ID           ?? "";

// ── Cache de settings da loja (evita uma query ao banco por mensagem) ─────────
type StoreSettings = {
  ai_enabled:    boolean;
  ai_name:       string;
  ai_personality: string | null;
  notify_phone:  string | null;
};

let settingsCache: StoreSettings | null = null;
let settingsCacheAt = 0;
const SETTINGS_TTL_MS = 5 * 60 * 1000; // recarrega a cada 5 minutos

async function loadStoreSettings(): Promise<StoreSettings> {
  const now = Date.now();
  if (settingsCache && now - settingsCacheAt < SETTINGS_TTL_MS) return settingsCache;

  const defaults: StoreSettings = {
    ai_enabled: true, ai_name: "Paulo", ai_personality: null, notify_phone: null,
  };

  if (!STORE_ID) return defaults;

  const { data } = await supabaseAdmin
    .from("users")
    .select("ai_enabled, ai_name, ai_personality, notify_phone")
    .eq("id", STORE_ID)
    .maybeSingle();

  settingsCache = {
    ai_enabled:     data?.ai_enabled    ?? true,
    ai_name:        data?.ai_name       ?? "Paulo",
    ai_personality: data?.ai_personality ?? null,
    notify_phone:   data?.notify_phone  ?? null,
  };
  settingsCacheAt = now;
  return settingsCache;
}

// ── Deduplicação híbrida: memória (mesmo processo) + banco (cross-restart) ────
//
// Nível 1 — Map em memória: bloqueia eventos duplicados que chegam ao mesmo dyno
//            na mesma sessão (proteção imediata, sem query ao banco).
// Nível 2 — Banco (time-window): busca se já existe mensagem idêntica para o
//            lead nos últimos 30s. Não precisa de coluna nova — usa text+lead_id.
//            Quando external_id estiver disponível, o upsert faz dedup automático.
//
// ⚠️ Para dedup permanente rode no Supabase Dashboard:
//    supabase/migration_messages_dedup.sql

const recentIds = new Map<string, number>(); // msgId → timestamp
const MEM_TTL   = 5 * 60 * 1000;            // 5 min (suficiente para retries da Evolution)

function isMemDuplicate(msgId: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentIds) { if (now - ts > MEM_TTL) recentIds.delete(k); }
  if (recentIds.has(msgId)) return true;
  recentIds.set(msgId, now);
  return false;
}

async function isDbDuplicate(leadId: string, text: string): Promise<boolean> {
  const since = new Date(Date.now() - 30_000).toISOString(); // 30 segundos
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("text", text)
    .eq("from_me", false)
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  await processEvolution(body).catch(console.error); // BUG-01 fix: await evita retry duplicado
  return new Response("OK", { status: 200 });
}

/** Salva mensagem — external_id previne duplicatas via índice único parcial no Postgres */
async function saveMessage(leadId: string, text: string, fromMe: boolean, externalId?: string) {
  const row: Record<string, unknown> = { lead_id: leadId, text, from_me: fromMe };
  if (externalId) row.external_id = externalId;
  await supabaseAdmin.from("messages").insert(row)
    .then(({ error }) => {
      if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
        console.error("[Messages] Erro:", error.message);
      }
    });
}

/** Envia texto via Evolution API */
async function sendWhatsApp(number: string, text: string) {
  if (!EVOLUTION_API_URL || !number) return;
  await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.error("[Evolution] Erro texto:", e.message));
}

/** Envia imagem via Evolution API */
async function sendWhatsAppImage(number: string, imageUrl: string, caption = "") {
  if (!EVOLUTION_API_URL || !number || !imageUrl) return;

  // Detecta mimetype pela extensão da URL
  const ext = imageUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png",  webp: "image/webp",
    gif: "image/gif",
  };
  const mimetype = mimeMap[ext] ?? "image/jpeg";

  await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
    body: JSON.stringify({ number, mediatype: "image", mimetype, caption, media: imageUrl }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => console.error("[Evolution] Erro imagem:", e.message));
}

/** Busca fotos de um veículo e envia via WhatsApp (máx 5 fotos) */
async function sendVehiclePhotos(number: string, vehicleId: string) {
  try {
    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("brand, model, year, price, photos")
      .eq("id", vehicleId)
      .maybeSingle();

    if (!vehicle || !Array.isArray(vehicle.photos) || vehicle.photos.length === 0) return;

    const photos  = vehicle.photos.slice(0, 5); // máx 5 fotos
    const caption = `${vehicle.brand} ${vehicle.model} ${vehicle.year ?? ""}${vehicle.price ? ` — R$ ${Number(vehicle.price).toLocaleString("pt-BR")}` : ""}`;

    for (let i = 0; i < photos.length; i++) {
      const photoCaption = i === 0 ? caption : ""; // caption só na primeira
      await sendWhatsAppImage(number, photos[i], photoCaption);
      // Pequena pausa entre fotos para não sobrecarregar
      if (i < photos.length - 1) await new Promise(r => setTimeout(r, 600));
    }

    console.log(`[Evolution] 📷 ${photos.length} foto(s) enviadas — ${caption}`);
  } catch (e) {
    console.error("[Evolution] Erro ao enviar fotos:", e);
  }
}

async function processEvolution(body: unknown) {
  try {
    const data  = (body as Record<string, unknown>);
    const event = data?.event as string;

    if (event !== "MESSAGES_UPSERT") return;

    const msg = data?.data as Record<string, unknown>;
    if (!msg || (msg?.key as Record<string, unknown>)?.fromMe) return;

    // ── Nível 1: dedup em memória (mesma instância) ───────────────────────
    const msgId = ((msg.key as Record<string, unknown>)?.id as string) ?? "";
    if (msgId && isMemDuplicate(msgId)) {
      console.warn("[Evolution] Duplicata ignorada (memória):", msgId);
      return;
    }

    // ── Nível 2: dedup no banco por external_id — ANTES de qualquer processamento (BUG-03 fix) ─
    if (msgId) {
      const { count } = await supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("external_id", msgId);
      if ((count ?? 0) > 0) {
        console.warn("[Evolution] Duplicata ignorada (external_id DB):", msgId);
        return;
      }
    }

    const remoteJid = ((msg.key as Record<string, unknown>)?.remoteJid as string) ?? "";
    if (!remoteJid.includes("@s.whatsapp.net")) return;

    const phone    = `wa:${remoteJid.replace("@s.whatsapp.net", "")}`;
    const phoneNum = phone.replace("wa:", "");
    const name     = (msg.pushName as string) ?? null;
    const text     =
      (msg.message as Record<string, unknown>)?.conversation as string
      ?? ((msg.message as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown>)?.text as string
      ?? "";

    if (!text) return;

    // ── 1. Carrega settings da loja ───────────────────────────────────────
    const settings = await loadStoreSettings();

    // Checa se a IA está ativa globalmente nas configurações da loja
    if (!settings.ai_enabled) {
      console.log(`[Evolution] IA desativada nas configurações da loja — ignorando`);
      return;
    }

    // ── 2. Extrai + qualifica ─────────────────────────────────────────────
    const extracted     = extractLeadData(text);
    const qualification = qualifyLead(text);

    // ── 2b. Referral do anúncio (ctwa_clid/UTM) — vem quando o lead clica em
    //        um anúncio Meta "Clique para o WhatsApp". Baileys expõe isso em
    //        contextInfo.externalAdReplyInfo da primeira mensagem da conversa.
    //        Campos exatos variam por versão — log abaixo serve pra validar
    //        contra o payload real de produção e ajustar se preciso.
    const messageContent = msg.message as Record<string, unknown> | undefined;
    const extendedText   = messageContent?.extendedTextMessage as Record<string, unknown> | undefined;
    const contextInfo    =
      (extendedText?.contextInfo as Record<string, unknown> | undefined) ??
      (messageContent?.contextInfo as Record<string, unknown> | undefined) ??
      ((msg as Record<string, unknown>).contextInfo as Record<string, unknown> | undefined);
    const adReplyInfo = contextInfo?.externalAdReplyInfo as Record<string, unknown> | undefined;

    if (contextInfo) {
      console.log("[Evolution] contextInfo recebido (debug ctwa/UTM):", JSON.stringify(contextInfo).slice(0, 500));
    }

    const sourceUrl = (adReplyInfo?.sourceUrl as string | undefined) ?? null;
    const ctwaClid  =
      (contextInfo?.ctwaClid as string | undefined) ??
      (adReplyInfo?.ctwaClid as string | undefined) ??
      (adReplyInfo?.sourceId as string | undefined) ??
      null;
    const adReferral = parseAdReferral(sourceUrl, ctwaClid);

    // ── 3. Upsert lead ────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...extractedSafe } = extracted;

    // Pré-checagem: sabe se é lead novo (p/ InitiateConversation) e evita
    // sobrescrever UTM já capturado em mensagem anterior com valores nulos.
    let existingQuery = supabaseAdmin
      .from("leads")
      .select("id, utm_source, utm_campaign, utm_medium, utm_adset, utm_ad, fbclid")
      .eq("phone", phone);
    if (STORE_ID) existingQuery = existingQuery.eq("store_id", STORE_ID);
    const { data: existingLead } = await existingQuery.maybeSingle();
    const isNewLead = !existingLead;

    const utmUpdates: Record<string, unknown> = {};
    if (adReferral.utm_source   && !existingLead?.utm_source)   utmUpdates.utm_source   = adReferral.utm_source;
    if (adReferral.utm_campaign && !existingLead?.utm_campaign) utmUpdates.utm_campaign = adReferral.utm_campaign;
    if (adReferral.utm_medium   && !existingLead?.utm_medium)   utmUpdates.utm_medium   = adReferral.utm_medium;
    if (adReferral.utm_adset    && !existingLead?.utm_adset)    utmUpdates.utm_adset    = adReferral.utm_adset;
    if (adReferral.utm_ad       && !existingLead?.utm_ad)       utmUpdates.utm_ad       = adReferral.utm_ad;
    if (adReferral.fbclid       && !existingLead?.fbclid)       utmUpdates.fbclid       = adReferral.fbclid;

    const lead = await upsertLead(phone, name, "whatsapp_evolution", {
      ...extractedSafe,
      qualification,
      ...utmUpdates,
    }, STORE_ID || undefined);

    // ── 4. CAPI — envia eventos de volta pro Meta (Conversions API) ───────
    const capiUserData: CAPIUserData = {
      phone:    phoneNum,
      name:     lead.name ?? name ?? null,
      fbclid:   lead.fbclid ?? adReferral.fbclid ?? null,
      fbclidTs: Math.floor(Date.now() / 1000),
    };
    const capiOpts = { leadId: lead.id, storeId: STORE_ID || undefined };

    if (isNewLead) {
      sendCAPIInitiateConversation(capiUserData, lead.id, capiOpts).catch(
        (e) => console.error("[CAPI] Erro InitiateConversation:", e),
      );
    }

    const { data: msgHistory } = await supabaseAdmin
      .from("messages")
      .select("text")
      .eq("lead_id", lead.id)
      .eq("from_me", false)
      .order("created_at", { ascending: true })
      .limit(50);

    const score = calcLeadScore([...(msgHistory ?? []).map(m => m.text ?? ""), text]);
    supabaseAdmin.from("leads").update({ score }).eq("id", lead.id).then(() => {});

    if (qualification === "quente") {
      sendCAPILeadEvent(capiUserData, lead.id, { ...capiOpts, score }).catch(
        (e) => console.error("[CAPI] Erro Lead:", e),
      );
    }
    if (score >= 70) {
      sendCAPIQualifiedLeadEvent(capiUserData, lead.id, score, capiOpts).catch(
        (e) => console.error("[CAPI] Erro QualifiedLead:", e),
      );
    }

    // ── 5. Salva mensagem do cliente (external_id garante dedup no banco) ────
    await saveMessage(lead.id, text, false, msgId);

    // ── 6. ⚡ HANDOFF CHECK — IA só responde se lead.ai_enabled = true ────
    // Se o vendedor humano assumiu este lead específico, a IA fica muda.
    const leadAiEnabled = (lead as Record<string, unknown>).ai_enabled !== false;

    if (!leadAiEnabled) {
      console.log(`[Evolution] ${phone} (${name}) [${qualification}]: vendedor assumiu este lead — IA pausada`);
      return;
    }

    // ── 7. IA responde com memória de conversa (como ChatGPT) ───────────────
    const rawReply = await getAIReply(
      text,
      { ...lead, id: lead.id },
      settings.ai_personality,
      settings.ai_name,
    );

    // ── 8. Processa tag de veículo [VEICULO:uuid] se presente ─────────────
    const { message: cleanReply, vehicleId } = parseVehicleTag(rawReply);

    // Envia texto da resposta
    await sendWhatsApp(phoneNum, cleanReply);

    // Se Paulo indicou um veículo, envia as fotos automaticamente
    if (vehicleId) {
      await sendVehiclePhotos(phoneNum, vehicleId);
    }

    // ── 9. Salva resposta da IA (sem a tag técnica) ───────────────────────
    await saveMessage(lead.id, cleanReply, true);

    // ── 10. Notifica vendedor se Quente ───────────────────────────────────
    const notifyPhone = settings.notify_phone ?? "";
    if (qualification === "quente" && notifyPhone) {
      const alerta =
        `🔥 *LEAD QUENTE!*\n👤 ${lead.name ?? phoneNum}\n📱 ${phoneNum}\n` +
        `💬 "${text.slice(0, 120)}"\n💰 ${lead.budget ? `R$${lead.budget}` : "orçamento não informado"}\n` +
        `🚗 ${lead.type ?? "veículo não informado"}\n👨‍💼 ${lead.seller ?? "sem vendedor"}\n\n⚡ Acesse o CRM agora!`;
      await sendWhatsApp(notifyPhone, alerta);
    }

    console.log(`[Evolution] ${phone} (${name}) [${qualification}] ai:${settings.ai_name}: "${text}" → "${cleanReply.slice(0, 60)}"`);
  } catch (e) {
    console.error("[Evolution] Erro:", e);
  }
}
