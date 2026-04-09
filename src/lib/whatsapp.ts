/**
 * 📱 whatsapp.ts
 * Envio de mensagens via WhatsApp Business API.
 * Logging via logWA() — filtre no Railway: [WA:SEND] [WA:WARN] [WA:ERROR]
 */

import axios, { AxiosError } from "axios";
import { supabaseAdmin as db } from "./supabaseAdmin";
import { waInfo, waWarn, waError, waDebug, waSend } from "./logger";

const GRAPH_URL = "https://graph.facebook.com/v19.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type SendResult = {
  success:    boolean;
  messageId?: string;
  error?:     string;
};

type GraphMessageResponse = {
  messages: Array<{ id: string }>;
};

type UserRow = {
  whatsapp_token:   string | null;
  phone_number_id:  string | null;
  token_expires_at: string | null;
};

// ─── sendWhatsAppMessage ──────────────────────────────────────────────────────
export async function sendWhatsAppMessage(
  userId:  string,
  to:      string,
  message: string
): Promise<SendResult> {

  // ── 1. Busca credenciais do usuário ────────────────────────────────────────
  waDebug("sendWhatsAppMessage() iniciando", { userId, to: to.substring(0, 8) + "***" });

  // BUG #4: .single() lançava exceção se userId não existisse — .maybeSingle() retorna null
  const { data: user, error: fetchErr } = await db
    .from("users")
    .select("whatsapp_token, phone_number_id, token_expires_at")
    .eq("id", userId)
    .maybeSingle<UserRow>();

  if (fetchErr || !user) {
    waError("Usuário não encontrado no banco", { userId, supabaseError: fetchErr?.message });
    return { success: false, error: "Usuário não encontrado" };
  }

  if (!user.whatsapp_token) {
    waWarn("WhatsApp não conectado para este userId", { userId });
    return { success: false, error: "WhatsApp não conectado. Acesse /integrations para autorizar." };
  }

  if (!user.phone_number_id) {
    waWarn("phone_number_id não configurado", { userId });
    return { success: false, error: "phone_number_id não configurado" };
  }

  // ── 2. Verifica se token expirou ───────────────────────────────────────────
  if (user.token_expires_at) {
    const expiresAt    = new Date(user.token_expires_at);
    const now          = new Date();
    const msRemaining  = expiresAt.getTime() - now.getTime();
    const daysLeft     = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

    if (msRemaining <= 0) {
      waError("Token expirado — envio bloqueado", { userId, expiresAt: user.token_expires_at });
      return { success: false, error: "Token expirado. Reconecte o WhatsApp em /integrations" };
    }

    if (daysLeft < 7) {
      waWarn(`Token expira em breve`, { userId, daysLeft, expiresAt: user.token_expires_at });
    }
  }

  // ── 3. Normaliza número ────────────────────────────────────────────────────
  const toClean = to.replace(/[\s+\-()]/g, "");

  // ── 4. Envia mensagem via Meta Graph API ───────────────────────────────────
  const url     = `${GRAPH_URL}/${user.phone_number_id}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                toClean,
    type:              "text",
    text:              { preview_url: false, body: message },
  };

  waSend("Enviando mensagem via sendWhatsAppMessage()", {
    userId,
    to:      toClean,
    preview: message.substring(0, 80),
  });

  try {
    const res = await axios.post<GraphMessageResponse>(url, payload, {
      headers: {
        "Authorization": `Bearer ${user.whatsapp_token}`,
        "Content-Type":  "application/json",
      },
      timeout: 10000,
    });

    const messageId = res.data.messages?.[0]?.id;
    waSend("Mensagem enviada com sucesso ✅", { userId, to: toClean, messageId });
    waInfo("sendWhatsAppMessage() OK", { userId, messageId });
    return { success: true, messageId };

  } catch (err) {
    const axErr  = err as AxiosError<{ error: { message: string; code: number } }>;
    const apiMsg = axErr.response?.data?.error?.message ?? axErr.message;
    const code   = axErr.response?.data?.error?.code;

    // Log completo do erro da Meta
    waError("Falha ao enviar mensagem via Meta API", {
      userId,
      to:       toClean,
      code,
      message:  apiMsg,
      status:   axErr.response?.status,
      response: axErr.response?.data,
    });

    // Token inválido/revogado — limpa do banco
    if (code === 190) {
      await db
        .from("users")
        .update({ whatsapp_token: null, token_expires_at: null })
        .eq("id", userId);
      waWarn("Token revogado (code 190) — removido do banco", { userId });
      return { success: false, error: "Token inválido. Reconecte o WhatsApp em /integrations" };
    }

    return { success: false, error: apiMsg };
  }
}

// ─── sendTemplateMessage ──────────────────────────────────────────────────────
export async function sendTemplateMessage(
  userId:       string,
  to:           string,
  templateName: string,
  langCode      = "pt_BR"
): Promise<SendResult> {

  // BUG-ZAP-03: .single() lançava exceção se userId não existisse — .maybeSingle() retorna null
  const { data: user } = await db
    .from("users")
    .select("whatsapp_token, phone_number_id")
    .eq("id", userId)
    .maybeSingle<UserRow>();

  if (!user?.whatsapp_token || !user?.phone_number_id) {
    waWarn("sendTemplateMessage() — WhatsApp não conectado", { userId });
    return { success: false, error: "WhatsApp não conectado" };
  }

  const toClean = to.replace(/[\s+\-()]/g, "");

  waSend("Enviando template message", { userId, to: toClean, templateName, langCode });

  try {
    const res = await axios.post<GraphMessageResponse>(
      `${GRAPH_URL}/${user.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to:                toClean,
        type:              "template",
        template: {
          name:     templateName,
          language: { code: langCode },
        },
      },
      {
        headers: {
          "Authorization": `Bearer ${user.whatsapp_token}`,
          "Content-Type":  "application/json",
        },
        timeout: 10000,
      }
    );

    const messageId = res.data.messages?.[0]?.id;
    waSend("Template enviado com sucesso ✅", { userId, to: toClean, templateName, messageId });
    return { success: true, messageId };

  } catch (err) {
    const axErr = err as AxiosError<{ error: { message: string; code: number } }>;
    const code  = axErr.response?.data?.error?.code;
    const msg   = axErr.response?.data?.error?.message ?? axErr.message;

    waError("Falha ao enviar template", {
      userId, templateName, code, message: msg,
      response: axErr.response?.data,
    });

    return { success: false, error: msg };
  }
}
