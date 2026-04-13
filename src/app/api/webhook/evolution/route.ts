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
import { getAIReply, extractLeadData, qualifyLead } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// BUG-ZAP-04: deduplicação de eventos (Evolution API pode reenviar MESSAGES_UPSERT)
const processedIds = new Map<string, number>();
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hora

function isDuplicate(id: string): boolean {
  const now = Date.now();
  for (const [k, ts] of processedIds) {
    if (now - ts > DEDUP_TTL_MS) processedIds.delete(k);
  }
  if (processedIds.has(id)) return true;
  processedIds.set(id, now);
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  processEvolution(body).catch(console.error);
  return new Response("OK", { status: 200 });
}

/** Salva mensagem na tabela messages */
async function saveMessage(leadId: string, text: string, fromMe: boolean) {
  await supabaseAdmin
    .from("messages")
    .insert({ lead_id: leadId, text, from_me: fromMe })
    .then(({ error }) => { if (error) console.error("[Messages] Erro:", error.message); });
}

/** Envia texto via Evolution API */
async function sendWhatsApp(number: string, text: string) {
  if (!EVOLUTION_API_URL || !number) return;
  // BUG-ZAP-05: timeout adicionado — sem ele, fetch fica pendurado se Evolution estiver fora
  await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.error("[Evolution] Erro envio:", e.message));
}

async function processEvolution(body: unknown) {
  try {
    const data  = (body as Record<string, unknown>);
    const event = data?.event as string;

    if (event !== "MESSAGES_UPSERT") return;

    const msg = data?.data as Record<string, unknown>;
    if (!msg || (msg?.key as Record<string, unknown>)?.fromMe) return;

    // BUG-ZAP-04: deduplicação pelo id da mensagem
    const msgId = ((msg.key as Record<string, unknown>)?.id as string) ?? "";
    if (msgId && isDuplicate(msgId)) {
      console.warn("[Evolution] Mensagem duplicada ignorada:", msgId);
      return;
    }

    const remoteJid = ((msg.key as Record<string, unknown>)?.remoteJid as string) ?? "";
    if (!remoteJid.includes("@s.whatsapp.net")) return;

    const phone = `wa:${remoteJid.replace("@s.whatsapp.net", "")}`;
    const name  = (msg.pushName as string) ?? null;
    const text  =
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

    // ── 3. Upsert lead ────────────────────────────────────────────────────
    const lead = await upsertLead(phone, name, "whatsapp_evolution", {
      ...extracted,
      qualification,
    }, STORE_ID || undefined);

    // ── 4. Salva mensagem do cliente ──────────────────────────────────────
    await saveMessage(lead.id, text, false);

    const phoneNum = phone.replace("wa:", "");

    // ── 5. ⚡ HANDOFF CHECK — IA só responde se lead.ai_enabled = true ────
    // Se o vendedor humano assumiu este lead específico, a IA fica muda.
    const leadAiEnabled = (lead as Record<string, unknown>).ai_enabled !== false;

    if (!leadAiEnabled) {
      console.log(`[Evolution] ${phone} (${name}) [${qualification}]: vendedor assumiu este lead — IA pausada`);
      return;
    }

    // ── 6. IA responde com a personalidade configurada nas Settings ────────
    // settings.ai_personality = skill definida na página de configurações
    // settings.ai_name        = nome da IA (ex: "Paulo")
    // Se ai_personality for null, usa o PAULO_SYSTEM padrão (vendedor PH Autoscar)
    const reply = await getAIReply(
      text,
      lead,
      settings.ai_personality,   // ← personalidade das Settings (a skill do documento!)
      settings.ai_name,           // ← nome configurado ("Paulo")
    );
    await sendWhatsApp(phoneNum, reply);

    // ── 7. Salva resposta da IA ───────────────────────────────────────────
    await saveMessage(lead.id, reply, true);

    // ── 8. Notifica vendedor se Quente ────────────────────────────────────
    const notifyPhone = settings.notify_phone ?? "";
    if (qualification === "quente" && notifyPhone) {
      const alerta =
        `🔥 *LEAD QUENTE!*\n👤 ${lead.name ?? phoneNum}\n📱 ${phoneNum}\n` +
        `💬 "${text.slice(0, 120)}"\n💰 ${lead.budget ? `R$${lead.budget}` : "orçamento não informado"}\n` +
        `🚗 ${lead.type ?? "veículo não informado"}\n👨‍💼 ${lead.seller ?? "sem vendedor"}\n\n⚡ Acesse o CRM agora!`;
      await sendWhatsApp(notifyPhone, alerta);
    }

    console.log(`[Evolution] ${phone} (${name}) [${qualification}] ai:${settings.ai_name}: "${text}" → "${reply}"`);
  } catch (e) {
    console.error("[Evolution] Erro:", e);
  }
}
