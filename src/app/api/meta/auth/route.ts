/**
 * GET /api/meta/auth
 *
 * Inicia fluxo OAuth 2.0 com a Meta.
 * Segurança:
 *   - userId NÃO vem da query string (previne session hijack - BUG-03)
 *   - state tem TTL de 10 minutos (previne flood no banco - BUG-02)
 *   - Limpa states expirados a cada chamada
 */

import { NextResponse } from "next/server";
import { randomUUID }   from "crypto";
import { getSupabase }  from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

// ─── Validação de config ───────────────────────────────────────────────────────
const META_APP_ID  = process.env.META_APP_ID;
const REDIRECT_URI = process.env.META_REDIRECT_URI
  ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/meta/callback`;

const SCOPES = [
  "business_management",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
].join(",");

const STATE_TTL_MINUTES = 10;

export async function GET() {
  // ── 1. Valida configuração obrigatória ─────────────────────────────────────
  if (!META_APP_ID) {
    return NextResponse.json(
      { error: "META_APP_ID não configurado. Adicione nas variáveis de ambiente." },
      { status: 500 }
    );
  }

  const db    = getSupabase();
  const state = randomUUID();
  const stateExpiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000).toISOString();

  // ── 2. Limpa states expirados (evita acúmulo - BUG-02) ────────────────────
  await db
    .from("users")
    .delete()
    .is("whatsapp_token", null)          // só linhas ainda não autenticadas
    .lt("state_expires_at", new Date().toISOString());

  // ── 3. Cria registro com state + TTL (sem userId externo - BUG-03) ─────────
  const { data: newUser, error: insertErr } = await db
    .from("users")
    .insert([{
      oauth_state:      state,
      state_expires_at: stateExpiresAt,
    }])
    .select("id")
    .single();

  if (insertErr || !newUser) {
    console.error("[OAuth] Erro ao criar sessão:", insertErr?.message);
    return NextResponse.json(
      { error: "Erro ao iniciar sessão OAuth" },
      { status: 500 }
    );
  }

  // ── 4. Monta URL de autorização Meta ──────────────────────────────────────
  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id",     META_APP_ID);
  authUrl.searchParams.set("redirect_uri",  REDIRECT_URI);
  authUrl.searchParams.set("scope",         SCOPES);
  authUrl.searchParams.set("state",         state);
  authUrl.searchParams.set("response_type", "code");

  console.log(`[OAuth] Sessão iniciada — userId: ${newUser.id}, expira em ${STATE_TTL_MINUTES}min`);
  return NextResponse.redirect(authUrl.toString());
}
