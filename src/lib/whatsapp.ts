/**
 * 📱 whatsapp.ts
 * Função principal para envio de mensagens WhatsApp.
 * Busca token e phone_number_id do userId no Supabase.
 */

import axios, { AxiosError } from "axios";
import { supabaseAdmin as db } from "./supabaseAdmin";

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
  whatsapp_token:  string | null;
  phone_number_id: string | null;
  token_expires_at: string | null;
};

// ─── sendWhatsAppMessage ──────────────────────────────────────────────────────
/**
 * Envia uma mensagem de texto via WhatsApp Business API.
 * @param userId  - ID do usuário/loja no Supabase
 * @param to      - Número do destinatário (ex: "5585999998888")
 * @param message - Texto da mensagem
 */
export async function sendWhatsAppMessage(
  userId:  string,
  to:      string,
  message: string
): Promise<SendResult> {

  // ── 1. Busca credenciais do usuário ────────────────────────────────────────
  const { data: user, error: fetchErr } = await db
    .from("users")
    .select("whatsapp_token, phone_number_id, token_expires_at")
    .eq("id", userId)
    .single<UserRow>();

  if (fetchErr || !user) {
    return { success: false, error: "Usuário não encontrado" };
  }

  if (!user.whatsapp_token) {
    return { success: false, error: "WhatsApp não conectado. Acesse /api/meta/auth para autorizar." };
  }

  if (!user.phone_number_id) {
    return { success: false, error: "phone_number_id não configurado" };
  }

  // ── 2. Verifica se token expirou ───────────────────────────────────────────
  if (user.token_expires_at) {
    const expiresAt = new Date(user.token_expires_at);
    const now       = new Date();
    if (expiresAt <= now) {
      return { success: false, error: "Token expirado. Reconecte o WhatsApp em /api/meta/auth" };
    }
    // Aviso se expira em menos de 7 dias
    const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 7) {
      console.warn(`[WhatsApp] ⚠️ Token do usuário ${userId} expira em ${daysLeft} dia(s)`);
    }
  }

  // ── 3. Normaliza número (remove +, espaços, traços) ────────────────────────
  const toClean = to.replace(/[\s+\-()]/g, "");

  // ── 4. Envia mensagem via Meta Graph API ───────────────────────────────────
  try {
    const res = await axios.post<GraphMessageResponse>(
      `${GRAPH_URL}/${user.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to:                toClean,
        type:              "text",
        text:              { preview_url: false, body: message },
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
    console.log(`[WhatsApp] ✅ Mensagem enviada para ${toClean} — ID: ${messageId}`);
    return { success: true, messageId };

  } catch (err) {
    const axErr = err as AxiosError<{ error: { message: string; code: number } }>;
    const apiMsg = axErr.response?.data?.error?.message ?? axErr.message;
    const code   = axErr.response?.data?.error?.code;

    // Token inválido/expirado detectado pela Meta
    if (code === 190) {
      await db
        .from("users")
        .update({ whatsapp_token: null, token_expires_at: null })
        .eq("id", userId);
      return { success: false, error: "Token inválido. Reconecte o WhatsApp em /integrations" };
    }

    console.error(`[WhatsApp] ❌ Erro ao enviar para ${toClean}:`, apiMsg);
    return { success: false, error: apiMsg };
  }
}

// ─── sendTemplateMessage ──────────────────────────────────────────────────────
/**
 * Envia mensagem usando template aprovado pela Meta.
 * @param userId       - ID do usuário/loja
 * @param to           - Número do destinatário
 * @param templateName - Nome do template (ex: "hello_world")
 * @param langCode     - Código do idioma (ex: "pt_BR")
 */
export async function sendTemplateMessage(
  userId:       string,
  to:           string,
  templateName: string,
  langCode      = "pt_BR"
): Promise<SendResult> {
  const { data: user } = await db
    .from("users")
    .select("whatsapp_token, phone_number_id")
    .eq("id", userId)
    .single<UserRow>();

  if (!user?.whatsapp_token || !user?.phone_number_id) {
    return { success: false, error: "WhatsApp não conectado" };
  }

  try {
    const res = await axios.post<GraphMessageResponse>(
      `${GRAPH_URL}/${user.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to:                to.replace(/[\s+\-()]/g, ""),
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
    return { success: true, messageId };
  } catch (err) {
    const axErr = err as AxiosError<{ error: { message: string } }>;
    return { success: false, error: axErr.response?.data?.error?.message ?? axErr.message };
  }
}
