/**
 * 📱 WhatsApp Meta Business API Webhook
 * GET  /api/webhook/whatsapp — verificação Meta
 * POST /api/webhook/whatsapp — mensagens recebidas
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertLead } from "@/lib/leads";
import { getAIReply, extractLeadData } from "@/lib/ai";

export const dynamic = "force-dynamic";

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? "7business_wa_token";
const WA_TOKEN        = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID     = process.env.WHATSAPP_PHONE_NUMBER_ID;

// ── GET: verificação do webhook pela Meta ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verificado ✅");
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: mensagens recebidas ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Responde 200 imediatamente (requisito Meta)
  const body = await req.json().catch(() => null);
  processMessage(body).catch(console.error);
  return new Response("OK", { status: 200 });
}

async function processMessage(body: unknown) {
  try {
    const entry    = (body as { entry?: unknown[] })?.entry?.[0] as Record<string, unknown>;
    const changes  = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value    = changes?.value as Record<string, unknown>;
    const messages = value?.messages as Array<Record<string, unknown>>;

    if (!messages?.length) return;

    for (const msg of messages) {
      if (msg.type !== "text") continue;

      const phone = `wa:${msg.from as string}`;
      const text  = (msg.text as { body: string })?.body ?? "";
      const name  = ((value?.contacts as Array<Record<string, unknown>>)?.[0]?.profile as { name?: string })?.name ?? null;

      // Extrai dados e salva no Supabase
      const extracted = extractLeadData(text);
      const lead = await upsertLead(phone, name, "whatsapp", extracted);

      // Gera resposta com IA
      const reply = await getAIReply(text, lead);

      // Envia resposta via Meta API
      if (WA_TOKEN && WA_PHONE_ID) {
        await fetch(
          `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${WA_TOKEN}`,
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to:   msg.from,
              type: "text",
              text: { body: reply },
            }),
          }
        ).catch(e => console.error("[WhatsApp] Erro envio:", e.message));
      }

      console.log(`[WhatsApp] ${msg.from as string}: "${text}" → "${reply}"`);
    }
  } catch (e) {
    console.error("[WhatsApp] Erro processamento:", e);
  }
}
