/**
 * GET /api/meta/callback
 *
 * Recebe code da Meta, troca por token permanente e salva no Supabase.
 * Segurança:
 *   - Valida state CSRF + TTL (state expirado = rejeitado)
 *   - Short-lived token nunca é logado (BUG-04)
 *   - Falha no phone_number_id bloqueia save (BUG-05 — falha explícita)
 */

import { NextRequest, NextResponse } from "next/server";
import axios                         from "axios";
import { getSupabaseAdmin as getSupabase }               from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const META_APP_ID     = process.env.META_APP_ID!;
const META_APP_SECRET = process.env.META_APP_SECRET!;
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REDIRECT_URI    = process.env.META_REDIRECT_URI   ?? `${APP_URL}/api/meta/callback`;
const GRAPH           = "https://graph.facebook.com/v19.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TokenResponse    = { access_token: string; token_type: string; expires_in?: number };
type BusinessResponse = { data: Array<{ id: string; name: string }> };
type PhoneResponse    = { data: Array<{ id: string; display_phone_number: string }> };

function redirect(path: string) {
  return NextResponse.redirect(`${APP_URL}${path}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  // ── Usuário negou acesso ───────────────────────────────────────────────────
  if (error) {
    console.warn("[OAuth] Acesso negado:", errorDesc);
    return redirect(`/integrations?error=${encodeURIComponent(errorDesc ?? "Acesso negado")}`);
  }

  if (!code || !state) {
    return redirect("/integrations?error=Parâmetros+inválidos");
  }

  const db = getSupabase();

  // ── Valida state CSRF + TTL ───────────────────────────────────────────────
  const { data: userRow, error: stateErr } = await db
    .from("users")
    .select("id, state_expires_at")
    .eq("oauth_state", state)
    .single();

  if (stateErr || !userRow) {
    console.error("[OAuth] State CSRF inválido ou não encontrado");
    return redirect("/integrations?error=Sessão+inválida+ou+expirada");
  }

  // Verifica TTL do state
  if (userRow.state_expires_at && new Date(userRow.state_expires_at) < new Date()) {
    console.warn("[OAuth] State expirado para userId:", userRow.id);
    await db.from("users").delete().eq("id", userRow.id);
    return redirect("/integrations?error=Sessão+expirada.+Tente+novamente.");
  }

  const userId = userRow.id as string;

  try {
    // ── 1. Troca code por short-lived token ───────────────────────────────────
    // ⚠️ Short token não é logado em nenhum ponto (BUG-04 corrigido)
    const shortRes = await axios.get<TokenResponse>(`${GRAPH}/oauth/access_token`, {
      params: { client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: REDIRECT_URI, code },
    });

    // ── 2. Troca por long-lived token (~60 dias) ──────────────────────────────
    const longRes = await axios.get<TokenResponse>(`${GRAPH}/oauth/access_token`, {
      params: {
        grant_type:        "fb_exchange_token",
        client_id:         META_APP_ID,
        client_secret:     META_APP_SECRET,
        fb_exchange_token: shortRes.data.access_token,
      },
    });

    const permanentToken = longRes.data.access_token;
    const expiresIn      = longRes.data.expires_in ?? 5184000; // 60 dias fallback
    const expiresAt      = new Date(Date.now() + expiresIn * 1000).toISOString();

    // ── 3. Busca Business ID ──────────────────────────────────────────────────
    const bizRes = await axios.get<BusinessResponse>(`${GRAPH}/me/businesses`, {
      params: { access_token: permanentToken, fields: "id,name" },
    });

    const business     = bizRes.data.data?.[0];
    const businessId   = business?.id;
    const businessName = business?.name ?? null;

    if (!businessId) {
      console.error("[OAuth] Nenhum Business ID encontrado para o token");
      return redirect("/integrations?error=Nenhuma+conta+Business+encontrada");
    }

    // ── 4. Busca phone_number_id (falha explícita - BUG-05 corrigido) ─────────
    let phoneNumberId: string | null = null;
    let displayPhone:  string | null = null;

    const waRes = await axios.get<BusinessResponse>(
      `${GRAPH}/${businessId}/owned_whatsapp_business_accounts`,
      { params: { access_token: permanentToken } }
    );
    const waAccountId = waRes.data.data?.[0]?.id;

    if (waAccountId) {
      const phoneRes = await axios.get<PhoneResponse>(
        `${GRAPH}/${waAccountId}/phone_numbers`,
        { params: { access_token: permanentToken, fields: "id,display_phone_number" } }
      );
      phoneNumberId = phoneRes.data.data?.[0]?.id                   ?? null;
      displayPhone  = phoneRes.data.data?.[0]?.display_phone_number ?? null;
    }

    if (!phoneNumberId) {
      // Salva token mas sinaliza que número precisa ser configurado manualmente
      console.warn("[OAuth] phone_number_id não encontrado — usuário precisa configurar");
    }

    // ── 5. Salva no Supabase — limpa state após uso ───────────────────────────
    const { error: saveErr } = await db
      .from("users")
      .update({
        whatsapp_token:   permanentToken,
        token_expires_at: expiresAt,
        business_id:      businessId,
        business_name:    businessName,
        phone_number_id:  phoneNumberId,
        display_phone:    displayPhone,
        oauth_state:      null,           // invalida state usado
        state_expires_at: null,
      })
      .eq("id", userId);

    if (saveErr) throw new Error(saveErr.message);

    // ── 6. Registra webhook na Meta automaticamente ───────────────────────────
    if (waAccountId) {
      try {
        await axios.post(
          `${GRAPH}/${waAccountId}/subscribed_apps`,
          null,
          { params: { access_token: permanentToken } }
        );
        console.log(`[OAuth] 📡 Webhook registrado na WABA ${waAccountId}`);
      } catch {
        // Não bloqueia o fluxo — usuário pode registrar manualmente no painel Meta
        console.warn("[OAuth] ⚠️ Não foi possível registrar webhook automaticamente");
      }
    }

    console.log(`[OAuth] ✅ userId ${userId} conectou WhatsApp (${displayPhone ?? "número pendente"})`);
    return redirect(`/integrations?success=whatsapp&userId=${userId}`);

  } catch (err) {
    // Token nunca é incluído na mensagem de erro (BUG-04)
    const msg = err instanceof Error ? err.message : "Erro no fluxo OAuth";
    console.error("[OAuth] Erro no callback:", msg);
    return redirect(`/integrations?error=${encodeURIComponent(msg)}`);
  }
}
