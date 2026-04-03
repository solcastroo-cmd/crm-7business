/**
 * 📱 Evolution API Webhook (WhatsApp via QR Code)
 * POST /api/webhook/evolution
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertLead } from "@/lib/leads";
import { getAIReply, extractLeadData } from "@/lib/ai";

export const dynamic = "force-dynamic";

const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR";

export async function POST(req: NextRequest) {
  NextResponse.json({ ok: true }); // responde rápido
  const body = await req.json().catch(() => null);
  processEvolution(body).catch(console.error);
  return new Response("OK", { status: 200 });
}

async function processEvolution(body: unknown) {
  try {
    const data  = (body as Record<string, unknown>);
    const event = data?.event as string;

    if (event !== "MESSAGES_UPSERT") return;

    const msg  = data?.data as Record<string, unknown>;
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

    const extracted = extractLeadData(text);
    const lead = await upsertLead(phone, name, "whatsapp_evolution", extracted);
    const reply = await getAIReply(text, lead);

    // Envia resposta via Evolution API
    if (EVOLUTION_API_URL) {
      const phoneNum = phone.replace("wa:", "");
      await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: phoneNum, text: reply }),
      }).catch(e => console.error("[Evolution] Erro envio:", e.message));
    }

    console.log(`[Evolution] ${phone} (${name}): "${text}" → "${reply}"`);
  } catch (e) {
    console.error("[Evolution] Erro:", e);
  }
}
