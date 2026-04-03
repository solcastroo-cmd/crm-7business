/**
 * GET /api/meta/auth
 * Gera state CSRF, salva no Supabase e redireciona para OAuth 2.0 do Meta.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const META_APP_ID    = process.env.META_APP_ID!;
const REDIRECT_URI   = process.env.META_REDIRECT_URI
  ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/meta/callback`;

const SCOPES = [
  "business_management",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
].join(",");

export async function GET(req: NextRequest) {
  // Valida config
  if (!META_APP_ID) {
    return NextResponse.json(
      { error: "META_APP_ID não configurado" },
      { status: 500 }
    );
  }

  // Recupera userId da query (ex: ?userId=xxx) ou cria usuário novo
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  // Gera state anti-CSRF único
  const state = randomUUID();

  const db = getSupabase();

  if (userId) {
    // Atualiza state no usuário existente
    await db
      .from("users")
      .update({ oauth_state: state })
      .eq("id", userId);
  } else {
    // Cria registro temporário para armazenar o state
    const { error } = await db
      .from("users")
      .insert([{ oauth_state: state }]);

    if (error) {
      return NextResponse.json(
        { error: "Erro ao criar sessão OAuth" },
        { status: 500 }
      );
    }
  }

  // Monta URL de autorização Meta
  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id",     META_APP_ID);
  authUrl.searchParams.set("redirect_uri",  REDIRECT_URI);
  authUrl.searchParams.set("scope",         SCOPES);
  authUrl.searchParams.set("state",         state);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
