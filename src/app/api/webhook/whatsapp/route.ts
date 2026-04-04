/**
 * 📱 WhatsApp Webhook — Multi-tenant + Debug logging
 *
 * GET  /api/webhook/whatsapp — verificação Meta
 * POST /api/webhook/whatsapp — mensagens recebidas
 *
 * DEBUG: Todos os pontos críticos logam com prefixo [WA:DEBUG]
 * para facilitar diagnóstico via Railway → Logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertLead }                from "@/lib/leads";
import { getAIReply, extractLeadData } from "@/lib/ai";
import { supabaseAdmin }             from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? "7business_wa_token";
const GRAPH           = "https://graph.facebook.com/v19.0";
const DEBUG           = process.env.WA_DEBUG === "true"; // ativa logs extras

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StoreConfig = {
  userId:        string;
  token:         string;
  phoneNumberId: string;
};

// ── Utilidade de log ──────────────────────────────────────────────────────────
function dbg(...args: unknown[]) {
  if (DEBUG) console.log("[WA:DEBUG]", ...args);
}

// ── GET: verificação Meta ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  dbg("Verificação webhook →", { mode, token, challenge });

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[WA] ✅ Webhook verificado com sucesso");
    return new Response(challenge, { status: 200 });
  }

  console.warn("[WA] ❌ Verificação falhou — token recebido:", token, "| esperado:", WA_VERIFY_TOKEN);
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: mensagens recebidas ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    console.error("[WA] ❌ Body inválido — não é JSON");
    return new Response("OK", { status: 200 }); // sempre 200 para Meta
  }

  // ── LOG COMPLETO DO BODY QUE CHEGA DA META ──────────────────────────────────
  console.log("[WA:RECV] Body recebido da Meta:", JSON.stringify(body, null, 2));

  processMessage(body).catch(e =>
    console.error("[WA] ❌ processMessage falhou:", e instanceof Error ? e.message : e)
  );

  return new Response("OK", { status: 200 }); // resposta imediata para Meta
}

// ── Busca loja pelo phone_number_id ──────────────────────────────────────────
async function findStore(phoneNumberId: string): Promise<StoreConfig | null> {
  dbg("findStore() → phoneNumberId:", phoneNumberId);

  // 1. Tenta pelo phone_number_id salvo no Supabase
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, whatsapp_token, phone_number_id")
    .eq("phone_number_id", phoneNumberId)
    .not("whatsapp_token", "is", null)
    .maybeSingle(); // ← FIX: .single() lançava erro se não achasse

  if (error) {
    console.error("[WA] ❌ Supabase erro em findStore:", error.message);
  }

  dbg("findStore() Supabase result:", data ? `userId=${data.id}` : "null");

  if (data?.whatsapp_token) {
    return { userId: data.id, token: data.whatsapp_token, phoneNumberId };
  }

  // 2. Fallback: env vars (legado / loja única)
  const envToken   = process.env.WHATSAPP_TOKEN;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (envToken && envPhoneId === phoneNumberId) {
    dbg("findStore() → usando credenciais de env vars");
    return { userId: "env", token: envToken, phoneNumberId };
  }

  // 3. Fallback final: último usuário ativo no banco (single-tenant legado)
  const { data: firstUser, error: firstErr } = await supabaseAdmin
    .from("users")
    .select("id, whatsapp_token, phone_number_id")
    .not("whatsapp_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (firstErr) {
    console.error("[WA] ❌ Supabase erro ao buscar fallback:", firstErr.message);
  }

  if (firstUser?.whatsapp_token) {
    console.warn("[WA] ⚠️ Usando fallback (último usuário ativo). phone_number_id salvo:", firstUser.phone_number_id, "| recebido:", phoneNumberId);
    return {
      userId:        firstUser.id,
      token:         firstUser.whatsapp_token,
      phoneNumberId: firstUser.phone_number_id ?? phoneNumberId,
    };
  }

  console.error("[WA] ❌ Nenhuma loja encontrada para phone_number_id:", phoneNumberId);
  return null;
}

// ── Envia mensagem + log completo da resposta da Meta ────────────────────────
async function sendMessage(store: StoreConfig, to: string, text: string) {
  const url     = `${GRAPH}/${store.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  dbg("sendMessage() →", { url, to, preview: text.substring(0, 60) });

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${store.token}`,
    },
    body: JSON.stringify(payload),
  });

  // ── LOG COMPLETO DA RESPOSTA DA META ─────────────────────────────────────
  const rawBody = await res.text();
  console.log(`[WA:SEND] Meta API → status ${res.status} | body: ${rawBody}`);

  if (!res.ok) {
    let parsed: { error?: { code?: number; message?: string } } = {};
    try { parsed = JSON.parse(rawBody); } catch { /* ok */ }

    const code = parsed?.error?.code;
    const msg  = parsed?.error?.message ?? `HTTP ${res.status}`;

    // Token revogado — limpa do banco
    if (code === 190 && store.userId !== "env") {
      await supabaseAdmin
        .from("users")
        .update({ whatsapp_token: null, token_expires_at: null })
        .eq("id", store.userId);
      console.warn(`[WA] Token revogado (code 190) — limpando userId ${store.userId}`);
    }

    throw new Error(`Meta API erro: [${code}] ${msg}`);
  }
}

// ── Processa mensagem ─────────────────────────────────────────────────────────
async function processMessage(body: unknown) {
  try {
    const entry    = (body as { entry?: unknown[] })?.entry?.[0] as Record<string, unknown>;
    const changes  = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value    = changes?.value as Record<string, unknown>;
    const messages = value?.messages as Array<Record<string, unknown>>;

    dbg("processMessage() estrutura:", {
      hasEntry:    !!entry,
      hasChanges:  !!changes,
      hasValue:    !!value,
      msgCount:    messages?.length ?? 0,
    });

    if (!messages?.length) {
      dbg("Sem mensagens no payload — pode ser status update, ignorando");
      return;
    }

    // ── Identifica a loja pelo phone_number_id do metadata ─────────────────
    const metadata      = value?.metadata as Record<string, string> | undefined;
    const phoneNumberId = metadata?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    console.log("[WA:RECV] phone_number_id extraído:", phoneNumberId);

    const store = await findStore(phoneNumberId);
    if (!store) return; // já logado em findStore

    console.log(`[WA] ✅ Loja identificada: userId=${store.userId} | phoneId=${phoneNumberId}`);

    for (const msg of messages) {
      if (msg.type !== "text") {
        dbg("Tipo de mensagem ignorado:", msg.type);
        continue;
      }

      const from    = msg.from as string;
      const text    = (msg.text as { body: string })?.body ?? "";
      const contacts = value?.contacts as Array<Record<string, unknown>>;
      const name    = (contacts?.[0]?.profile as { name?: string })?.name ?? null;

      console.log(`[WA:RECV] Mensagem de ${from} (${name ?? "sem nome"}): "${text.substring(0, 80)}"`);

      // ── Salva lead isolado pela loja ──────────────────────────────────────
      const extracted = extractLeadData(text);
      dbg("extractLeadData():", extracted);

      const lead = await upsertLead(`wa:${from}`, name, "whatsapp", extracted, store.userId);
      dbg("Lead upsert OK:", lead.id);

      // ── IA responde ───────────────────────────────────────────────────────
      const reply = await getAIReply(text, lead);
      console.log(`[WA] Resposta IA para ${from}: "${reply.substring(0, 80)}"`);

      // ── Envia resposta via token DA loja ──────────────────────────────────
      await sendMessage(store, from, reply);

      console.log(`[WA] ✅ Ciclo completo: userId=${store.userId} | ${from}`);
    }
  } catch (e) {
    console.error("[WA] ❌ Erro em processMessage:", e instanceof Error ? e.stack : e);
  }
}
