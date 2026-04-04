/**
 * 📱 WhatsApp Webhook — Multi-tenant
 *
 * GET  /api/webhook/whatsapp — verificação Meta
 * POST /api/webhook/whatsapp — mensagens recebidas
 *
 * Logging via logWA() — filtre no Railway com: [WA:RECV] [WA:SEND] [WA:ERROR]
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertLead }                from "@/lib/leads";
import { getAIReply, extractLeadData } from "@/lib/ai";
import { supabaseAdmin }             from "@/lib/supabaseAdmin";
import { waInfo, waWarn, waError, waDebug, waRecv, waSend } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? "7business_wa_token";
const GRAPH           = "https://graph.facebook.com/v19.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StoreConfig = {
  userId:        string;
  token:         string;
  phoneNumberId: string;
};

// ── GET: verificação Meta ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  waDebug("Verificação webhook recebida", { mode, tokenMatch: token === WA_VERIFY_TOKEN });

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    waInfo("Webhook verificado com sucesso ✅");
    return new Response(challenge, { status: 200 });
  }

  waWarn("Verificação falhou — token incorreto", { received: token });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: mensagens recebidas ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    waError("Body recebido da Meta não é JSON válido");
    return new Response("OK", { status: 200 }); // sempre 200 para Meta
  }

  // Log completo do payload bruto recebido da Meta
  waRecv("Payload recebido da Meta", body);

  processMessage(body).catch(e =>
    waError("processMessage() lançou exceção não capturada", {
      message: e instanceof Error ? e.message : String(e),
      stack:   e instanceof Error ? e.stack?.split("\n").slice(0, 5) : undefined,
    })
  );

  return new Response("OK", { status: 200 }); // resposta imediata para Meta
}

// ── Busca loja pelo phone_number_id ──────────────────────────────────────────
async function findStore(phoneNumberId: string): Promise<StoreConfig | null> {
  waDebug("findStore() iniciando", { phoneNumberId });

  // 1. Tenta pelo phone_number_id salvo no Supabase
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, whatsapp_token, phone_number_id")
    .eq("phone_number_id", phoneNumberId)
    .not("whatsapp_token", "is", null)
    .maybeSingle();

  if (error) waError("Supabase erro em findStore()", { message: error.message, code: error.code });

  if (data?.whatsapp_token) {
    waDebug("findStore() → loja encontrada via Supabase", { userId: data.id });
    return { userId: data.id, token: data.whatsapp_token, phoneNumberId };
  }

  // 2. Fallback: env vars (legado / loja única)
  const envToken   = process.env.WHATSAPP_TOKEN;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (envToken && envPhoneId === phoneNumberId) {
    waDebug("findStore() → usando credenciais env vars");
    return { userId: "env", token: envToken, phoneNumberId };
  }

  // BUG #5: fallback "último usuário ativo" REMOVIDO — risco de vazamento multi-tenant.
  // Se o phone_number_id não bater com nenhum registro no banco nem nas env vars,
  // rejeitamos silenciosamente em vez de usar dados de outra loja.
  waError("findStore() falhou — phone_number_id não mapeado para nenhuma loja", {
    phoneNumberId,
    dica: "Verifique se o phone_number_id está salvo corretamente na tabela users",
  });
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

  waSend("Enviando mensagem para Meta", {
    url,
    to,
    userId:  store.userId,
    preview: text.substring(0, 80),
  });

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${store.token}`,
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await res.text();

  // Log completo da resposta da Meta (status + body)
  waSend("Resposta da Meta API", { status: res.status, body: rawBody });

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
      waWarn("Token revogado (code 190) — limpando do banco", { userId: store.userId });
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

    waDebug("processMessage() estrutura do payload", {
      hasEntry:   !!entry,
      hasChanges: !!changes,
      hasValue:   !!value,
      msgCount:   messages?.length ?? 0,
    });

    if (!messages?.length) {
      waDebug("Sem mensagens no payload — provavelmente status update, ignorando");
      return;
    }

    const metadata      = value?.metadata as Record<string, string> | undefined;
    const phoneNumberId = metadata?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    waRecv("phone_number_id extraído do metadata", { phoneNumberId });

    const store = await findStore(phoneNumberId);
    if (!store) return;

    waInfo("Loja identificada", { userId: store.userId, phoneId: phoneNumberId });

    for (const msg of messages) {
      if (msg.type !== "text") {
        waDebug("Tipo de mensagem ignorado", { type: msg.type });
        continue;
      }

      const from     = msg.from as string;
      const text     = (msg.text as { body: string })?.body ?? "";
      const contacts = value?.contacts as Array<Record<string, unknown>>;
      const name     = (contacts?.[0]?.profile as { name?: string })?.name ?? null;

      waRecv("Mensagem de texto recebida", {
        from,
        name,
        preview:  text.substring(0, 100),
        userId:   store.userId,
      });

      // ── Extrai dados e salva lead ─────────────────────────────────────────
      const extracted = extractLeadData(text);
      waDebug("extractLeadData()", extracted);

      const lead = await upsertLead(`wa:${from}`, name, "whatsapp", extracted, store.userId);
      waDebug("Lead upsert concluído", { leadId: lead.id, stage: lead.stage });

      // ── IA responde ───────────────────────────────────────────────────────
      const reply = await getAIReply(text, lead);
      waDebug("Resposta gerada pela IA", { preview: reply.substring(0, 100) });

      // ── Envia resposta via token DA loja ──────────────────────────────────
      await sendMessage(store, from, reply);

      waInfo("Ciclo completo ✅", { userId: store.userId, from, leadId: lead.id });
    }
  } catch (e) {
    waError("Erro inesperado em processMessage()", {
      message: e instanceof Error ? e.message : String(e),
      stack:   e instanceof Error ? e.stack?.split("\n").slice(0, 8) : undefined,
    });
  }
}
