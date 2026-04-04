/**
 * 📱 WhatsApp Webhook — Multi-tenant
 *
 * Cada mensagem chega com um phone_number_id no metadata.
 * Buscamos o usuário (loja) correspondente no Supabase e usamos
 * o token DAQUELE usuário para responder — completamente isolado.
 *
 * GET  /api/webhook/whatsapp — verificação Meta
 * POST /api/webhook/whatsapp — mensagens recebidas
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertLead }                from "@/lib/leads";
import { getAIReply, extractLeadData } from "@/lib/ai";
import { supabaseAdmin }             from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? "7business_wa_token";
const GRAPH           = "https://graph.facebook.com/v19.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StoreConfig = {
  userId:       string;
  token:        string;
  phoneNumberId: string;
};

// ── GET: verificação ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[WA] Webhook verificado ✅");
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: mensagens recebidas ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  processMessage(body).catch(console.error);
  return new Response("OK", { status: 200 }); // resposta imediata para Meta
}

// ── Busca loja pelo phone_number_id ──────────────────────────────────────────
async function findStore(phoneNumberId: string): Promise<StoreConfig | null> {
  // 1. Tenta pelo phone_number_id salvo no Supabase
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, whatsapp_token, phone_number_id")
    .eq("phone_number_id", phoneNumberId)
    .not("whatsapp_token", "is", null)
    .single();

  if (data?.whatsapp_token) {
    return { userId: data.id, token: data.whatsapp_token, phoneNumberId };
  }

  // 2. Fallback: env vars (legado / loja única)
  const envToken   = process.env.WHATSAPP_TOKEN;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (envToken && envPhoneId === phoneNumberId) {
    return { userId: "env", token: envToken, phoneNumberId };
  }

  // 3. Fallback final: primeiro usuário ativo (single-tenant legado)
  if (!data && envToken) {
    const { data: firstUser } = await supabaseAdmin
      .from("users")
      .select("id, whatsapp_token, phone_number_id")
      .not("whatsapp_token", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (firstUser?.whatsapp_token) {
      return { userId: firstUser.id, token: firstUser.whatsapp_token, phoneNumberId: firstUser.phone_number_id ?? phoneNumberId };
    }
  }

  return null;
}

// ── Envia mensagem ─────────────────────────────────────────────────────────────
async function sendMessage(store: StoreConfig, to: string, text: string) {
  const res = await fetch(`${GRAPH}/${store.phoneNumberId}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${store.token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { code?: number; message?: string } };
    // Token revogado — limpa do banco
    if (err?.error?.code === 190 && store.userId !== "env") {
      await supabaseAdmin
        .from("users")
        .update({ whatsapp_token: null, token_expires_at: null })
        .eq("id", store.userId);
      console.warn(`[WA] Token revogado para userId ${store.userId} — limpando`);
    }
    throw new Error(err?.error?.message ?? "Erro ao enviar mensagem");
  }
}

// ── Processa mensagem ─────────────────────────────────────────────────────────
async function processMessage(body: unknown) {
  try {
    const entry   = (body as { entry?: unknown[] })?.entry?.[0] as Record<string, unknown>;
    const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value   = changes?.value as Record<string, unknown>;
    const messages = value?.messages as Array<Record<string, unknown>>;

    if (!messages?.length) return;

    // ── Identifica a loja pelo phone_number_id do metadata ─────────────────
    const metadata     = value?.metadata as Record<string, string> | undefined;
    const phoneNumberId = metadata?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    const store = await findStore(phoneNumberId);
    if (!store) {
      console.warn(`[WA] Nenhuma loja encontrada para phone_number_id: ${phoneNumberId}`);
      return;
    }

    console.log(`[WA] Loja: userId=${store.userId} | phoneId=${phoneNumberId}`);

    for (const msg of messages) {
      if (msg.type !== "text") continue;

      const from = msg.from as string;
      const text = (msg.text as { body: string })?.body ?? "";
      const name = ((value?.contacts as Array<Record<string, unknown>>)?.[0]?.profile as { name?: string })?.name ?? null;

      // ── Salva lead isolado pela loja ──────────────────────────────────────
      const extracted = extractLeadData(text);
      const lead = await upsertLead(`wa:${from}`, name, "whatsapp", extracted, store.userId);

      // ── IA responde ───────────────────────────────────────────────────────
      const reply = await getAIReply(text, lead);

      // ── Envia resposta via token DA loja ──────────────────────────────────
      await sendMessage(store, from, reply);

      console.log(`[WA] userId=${store.userId} | ${from}: "${text.substring(0, 50)}" → ok`);
    }
  } catch (e) {
    console.error("[WA] Erro:", e instanceof Error ? e.message : e);
  }
}
