/**
 * 📱 Evolution API Webhook (WhatsApp via QR Code)
 * POST /api/webhook/evolution
 *
 * Fluxo:
 *  1. Recebe mensagem do cliente via WhatsApp
 *  2. Extrai dados do lead (orçamento, tipo, pagamento, nome)
 *  3. Qualifica como Quente / Morno / Frio via IA
 *  4. Salva/atualiza lead no Supabase com qualification
 *  5. IA (PAULO) responde ao cliente
 *  6. Se Quente → notifica vendedor via WhatsApp (SELLER_NOTIFY_PHONE)
 */

import { NextRequest } from "next/server";
import { upsertLead } from "@/lib/leads";
import { getAIReply, extractLeadData, qualifyLead } from "@/lib/ai";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL   = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY   = process.env.EVOLUTION_API_KEY ?? "";
const EVOLUTION_INSTANCE  = process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR";
// Número do vendedor/loja para receber alertas de lead Quente (ex: "5585999998888")
const SELLER_NOTIFY_PHONE = process.env.SELLER_NOTIFY_PHONE ?? "";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  processEvolution(body).catch(console.error);
  return new Response("OK", { status: 200 });
}

/** Envia texto via Evolution API */
async function sendWhatsApp(number: string, text: string) {
  if (!EVOLUTION_API_URL || !number) return;
  await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number, text }),
  }).catch((e) => console.error("[Evolution] Erro envio:", e.message));
}

async function processEvolution(body: unknown) {
  try {
    const data  = (body as Record<string, unknown>);
    const event = data?.event as string;

    if (event !== "MESSAGES_UPSERT") return;

    const msg = data?.data as Record<string, unknown>;
    if (!msg || (msg?.key as Record<string, unknown>)?.fromMe) return;

    const remoteJid = ((msg.key as Record<string, unknown>)?.remoteJid as string) ?? "";
    if (!remoteJid.includes("@s.whatsapp.net")) return; // ignora grupos

    const phone = `wa:${remoteJid.replace("@s.whatsapp.net", "")}`;
    const name  = (msg.pushName as string) ?? null;
    const text  =
      (msg.message as Record<string, unknown>)?.conversation as string
      ?? ((msg.message as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown>)?.text as string
      ?? "";

    if (!text) return;

    // ── 1. Extrai dados + qualifica ───────────────────────────────────────
    const extracted     = extractLeadData(text);
    const qualification = qualifyLead(text);

    // ── 2. Salva/atualiza lead com qualification ──────────────────────────
    const lead = await upsertLead(phone, name, "whatsapp_evolution", {
      ...extracted,
      qualification,
    });

    // ── 3. IA responde ao cliente ─────────────────────────────────────────
    const reply = await getAIReply(text, lead);
    const phoneNum = phone.replace("wa:", "");
    await sendWhatsApp(phoneNum, reply);

    // ── 4. Notifica vendedor SE lead for Quente ───────────────────────────
    if (qualification === "quente" && SELLER_NOTIFY_PHONE) {
      const nomeCliente = lead.name ?? phone;
      const alerta =
        `🔥 *LEAD QUENTE!*\n` +
        `👤 ${nomeCliente}\n` +
        `📱 ${phoneNum}\n` +
        `💬 "${text.slice(0, 120)}"\n` +
        `💰 Orçamento: ${lead.budget ? `R$${lead.budget}` : "não informado"}\n` +
        `🚗 Veículo: ${lead.type ?? "não informado"}\n` +
        `👨‍💼 Vendedor: ${lead.seller ?? "sem vendedor"}\n` +
        `\n⚡ Acesse o CRM agora para fechar!`;

      await sendWhatsApp(SELLER_NOTIFY_PHONE, alerta);
      console.log(`[Evolution] 🔥 Lead QUENTE notificado ao vendedor: ${phoneNum}`);
    }

    console.log(`[Evolution] ${phone} (${name}) [${qualification}]: "${text}" → "${reply}"`);
  } catch (e) {
    console.error("[Evolution] Erro:", e);
  }
}
