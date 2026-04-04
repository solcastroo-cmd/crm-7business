/**
 * 🔍 whatsappDebug.ts — Ferramentas de diagnóstico WhatsApp
 *
 * Funções usadas pelo endpoint GET /api/debug/whatsapp
 * para verificar o estado da integração sem precisar
 * olhar direto no banco.
 */

import { supabaseAdmin } from "./supabaseAdmin";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type TokenStatus = {
  valid:         boolean;
  expired:       boolean;
  daysRemaining: number | null;   // null = token permanente (sem expiração)
  expiresAt:     string | null;
  reason:        string;
};

export type StoreDebugInfo = {
  userId:          string;
  businessName:    string | null;
  displayPhone:    string | null;
  phoneNumberId:   string | null;
  hasToken:        boolean;
  tokenStatus:     TokenStatus;
  createdAt:       string;
};

// ─── checkTokenValidity ───────────────────────────────────────────────────────
/**
 * Verifica se o token WhatsApp de um userId está válido ou expirado.
 *
 * @param userId  - ID do registro na tabela users
 * @returns TokenStatus com detalhes da validade
 */
export async function checkTokenValidity(userId: string): Promise<TokenStatus> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("whatsapp_token, token_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return {
      valid:         false,
      expired:       false,
      daysRemaining: null,
      expiresAt:     null,
      reason:        error ? `Erro ao buscar usuário: ${error.message}` : "Usuário não encontrado",
    };
  }

  if (!data.whatsapp_token) {
    return {
      valid:         false,
      expired:       false,
      daysRemaining: null,
      expiresAt:     null,
      reason:        "Nenhum token salvo — WhatsApp não conectado",
    };
  }

  // Token permanente (sem data de expiração)
  if (!data.token_expires_at) {
    return {
      valid:         true,
      expired:       false,
      daysRemaining: null,
      expiresAt:     null,
      reason:        "Token permanente — sem expiração configurada",
    };
  }

  const expiresAt    = new Date(data.token_expires_at);
  const now          = new Date();
  const msRemaining  = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const expired      = msRemaining <= 0;

  if (expired) {
    return {
      valid:         false,
      expired:       true,
      daysRemaining: daysRemaining, // número negativo
      expiresAt:     data.token_expires_at,
      reason:        `Token expirado há ${Math.abs(daysRemaining)} dia(s). Reconecte em /integrations`,
    };
  }

  const warnLevel = daysRemaining < 3 ? "🔴" : daysRemaining < 7 ? "🟡" : "🟢";

  return {
    valid:         true,
    expired:       false,
    daysRemaining,
    expiresAt:     data.token_expires_at,
    reason:        `${warnLevel} Token válido — expira em ${daysRemaining} dia(s)`,
  };
}

// ─── getStoreDebugInfo ────────────────────────────────────────────────────────
/**
 * Retorna snapshot completo do estado da loja para diagnóstico.
 * Não expõe o token completo — apenas os primeiros 8 caracteres.
 */
export async function getStoreDebugInfo(userId: string): Promise<StoreDebugInfo | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, business_name, display_phone, phone_number_id, whatsapp_token, token_expires_at, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const tokenStatus = await checkTokenValidity(userId);

  return {
    userId:        data.id,
    businessName:  data.business_name  ?? null,
    displayPhone:  data.display_phone  ?? null,
    phoneNumberId: data.phone_number_id ?? null,
    hasToken:      !!data.whatsapp_token,
    tokenStatus,
    createdAt:     data.created_at,
  };
}
