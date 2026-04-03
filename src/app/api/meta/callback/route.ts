/**
 * GET /api/meta/callback
 * 1. Valida state CSRF
 * 2. Troca code → short-lived token
 * 3. Troca short-lived → long-lived token (~60 dias)
 * 4. Busca business_id e phone_number_id do usuário
 * 5. Salva tudo na tabela users do Supabase
 * 6. Redireciona para /integrations?success=whatsapp
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const META_APP_ID     = process.env.META_APP_ID!;
const META_APP_SECRET = process.env.META_APP_SECRET!;
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REDIRECT_URI    = process.env.META_REDIRECT_URI ?? `${APP_URL}/api/meta/callback`;
const GRAPH_URL       = "https://graph.facebook.com/v19.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ShortTokenResponse = { access_token: string; token_type: string };
type LongTokenResponse  = { access_token: string; token_type: string; expires_in: number };
type BusinessResponse   = { data: Array<{ id: string; name: string }> };
type WAAccountResponse  = { data: Array<{ id: string; display_phone_number: string; verified_name: string }> };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ── Usuário negou acesso ───────────────────────────────────────────────────
  if (error) {
    const desc = searchParams.get("error_description") ?? "Acesso negado pelo usuário";
    console.warn("[OAuth] Acesso negado:", desc);
    return NextResponse.redirect(`${APP_URL}/integrations?error=${encodeURIComponent(desc)}`);
  }

  // ── Parâmetros obrigatórios ────────────────────────────────────────────────
  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/integrations?error=Parâmetros+inválidos`);
  }

  const db = getSupabase();

  // ── Valida state CSRF ──────────────────────────────────────────────────────
  const { data: userRow, error: stateErr } = await db
    .from("users")
    .select("id")
    .eq("oauth_state", state)
    .single();

  if (stateErr || !userRow) {
    console.error("[OAuth] State CSRF inválido:", state);
    return NextResponse.redirect(`${APP_URL}/integrations?error=Sessão+inválida`);
  }

  const userId = userRow.id as string;

  try {
    // ── 1. Troca code por short-lived token ──────────────────────────────────
    const shortRes = await axios.get<ShortTokenResponse>(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        client_id:     META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
      },
    });
    const shortToken = shortRes.data.access_token;

    // ── 2. Troca short-lived por long-lived token (~60 dias) ─────────────────
    const longRes = await axios.get<LongTokenResponse>(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        grant_type:        "fb_exchange_token",
        client_id:         META_APP_ID,
        client_secret:     META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });
    const permanentToken = longRes.data.access_token;
    const expiresIn      = longRes.data.expires_in; // segundos (~5184000 = 60 dias)
    const expiresAt      = new Date(Date.now() + expiresIn * 1000).toISOString();

    // ── 3. Busca Business ID vinculado ao token ──────────────────────────────
    const bizRes = await axios.get<BusinessResponse>(`${GRAPH_URL}/me/businesses`, {
      params: { access_token: permanentToken, fields: "id,name" },
    });
    const business     = bizRes.data.data?.[0];
    const businessId   = business?.id   ?? null;
    const businessName = business?.name ?? null;

    // ── 4. Busca phone_number_id do WhatsApp Business ────────────────────────
    let phoneNumberId  = null;
    let displayPhone   = null;

    if (businessId) {
      try {
        const waRes = await axios.get<WAAccountResponse>(
          `${GRAPH_URL}/${businessId}/owned_whatsapp_business_accounts`,
          { params: { access_token: permanentToken } }
        );
        const waAccountId = waRes.data.data?.[0]?.id;

        if (waAccountId) {
          const phoneRes = await axios.get<WAAccountResponse>(
            `${GRAPH_URL}/${waAccountId}/phone_numbers`,
            { params: { access_token: permanentToken, fields: "id,display_phone_number,verified_name" } }
          );
          const phone    = phoneRes.data.data?.[0];
          phoneNumberId  = phone?.id                    ?? null;
          displayPhone   = phone?.display_phone_number  ?? null;
        }
      } catch (phoneErr) {
        console.warn("[OAuth] Não foi possível buscar phone_number_id:", phoneErr);
      }
    }

    // ── 5. Salva no Supabase ─────────────────────────────────────────────────
    const { error: saveErr } = await db
      .from("users")
      .update({
        whatsapp_token:   permanentToken,
        token_expires_at: expiresAt,
        business_id:      businessId,
        business_name:    businessName,
        phone_number_id:  phoneNumberId,
        display_phone:    displayPhone,
        oauth_state:      null, // limpa o state usado
      })
      .eq("id", userId);

    if (saveErr) throw new Error(saveErr.message);

    console.log(`[OAuth] ✅ Usuário ${userId} conectou WhatsApp (${displayPhone ?? "número pendente"})`);

    // ── 6. Redireciona para sucesso ──────────────────────────────────────────
    return NextResponse.redirect(`${APP_URL}/integrations?success=whatsapp&userId=${userId}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[OAuth] Erro no callback:", msg);
    return NextResponse.redirect(`${APP_URL}/integrations?error=${encodeURIComponent(msg)}`);
  }
}
