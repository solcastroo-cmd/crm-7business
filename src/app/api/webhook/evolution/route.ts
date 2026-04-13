/**
 * 📱 Evolution API Webhook (WhatsApp via QR Code)
 * POST /api/webhook/evolution
 *
 * Fluxo:
 *  1. Recebe mensagem do cliente via WhatsApp
 *  2. Extrai dados do lead (orçamento, tipo, pagamento, nome)
 *  3. Qualifica como Quente / Morno / Frio via IA
 *  4. Salva/atualiza lead no Supabase com qualification
 *  5. Salva mensagem do cliente na tabela messages
 *  6. IA (PAULO) responde ao cliente + salva resposta em messages
 *  7. Se Quente → notifica vendedor via WhatsApp (SELLER_NOTIFY_PHONE)
 */

import { NextRequest } from "next/server";
import { upsertLead } from "@/lib/leads";
import { getAIReply, extractLeadData, qualifyLead } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL   = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY   = process.env.EVOLUTION_API_KEY ?? "";
const EVOLUTION_INSTANCE  = process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR";
const SELLER_NOTIFY_PHONE = process.env.SELLER_NOTIFY_PHONE ?? "";

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

    // ── 1. Extrai + qualifica ─────────────────────────────────────────────
    const extracted     = extractLeadData(text);
    const qualification = qualifyLead(text);

    // ── 2. Upsert lead ────────────────────────────────────────────────────
    const lead = await upsertLead(phone, name, "whatsapp_evolution", {
      ...extracted,
      qualification,
    });

    // ── 3. Salva mensagem do cliente ──────────────────────────────────────
    await saveMessage(lead.id, text, false);

    const phoneNum = phone.replace("wa:", "");

    // ── 4. ⚡ HANDOFF CHECK — Paulo só responde se ai_enabled = true ───────
    // Se o vendedor humano já assumiu (ai_enabled = false), Paulo fica mudo.
    // Tratamos ausência do campo (coluna ainda não criada) como true (seguro).
    const aiEnabled = (lead as Record<string, unknown>).ai_enabled !== false;

    if (!aiEnabled) {
      console.log(`[Evolution] ${phone} (${name}) [${qualification}]: IA desativada — vendedor atende`);
      return;
    }

    // ── 5. IA responde ────────────────────────────────────────────────────
    const reply = await getAIReply(text, lead);
    await sendWhatsApp(phoneNum, reply);

    // ── 6. Salva resposta da IA ───────────────────────────────────────────
    await saveMessage(lead.id, reply, true);

    // ── 7. Notifica vendedor se Quente ────────────────────────────────────
    if (qualification === "quente" && SELLER_NOTIFY_PHONE) {
      const alerta =
        `🔥 *LEAD QUENTE!*\n👤 ${lead.name ?? phoneNum}\n📱 ${phoneNum}\n` +
        `💬 "${text.slice(0, 120)}"\n💰 ${lead.budget ? `R$${lead.budget}` : "orçamento não informado"}\n` +
        `🚗 ${lead.type ?? "veículo não informado"}\n👨‍💼 ${lead.seller ?? "sem vendedor"}\n\n⚡ Acesse o CRM agora!`;
      await sendWhatsApp(SELLER_NOTIFY_PHONE, alerta);
    }

    console.log(`[Evolution] ${phone} (${name}) [${qualification}]: "${text}" → "${reply}"`);
  } catch (e) {
    console.error("[Evolution] Erro:", e);
  }
}
