/**
 * GET /api/integrations
 *
 * Retorna status real de todas as integrações.
 * Lê da tabela users (OAuth) em vez de .env (BUG-06 corrigido).
 * Query param: ?userId=xxx para status específico de uma loja.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type UserRow = {
  whatsapp_token:   string | null;
  phone_number_id:  string | null;
  display_phone:    string | null;
  business_name:    string | null;
  token_expires_at: string | null;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  // ── Dados WhatsApp do Supabase (OAuth) ─────────────────────────────────────
  let waStatus      = "❌ Não conectado";
  let waPhone       = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "—";
  let waActive      = false;
  let waDaysLeft:  number | null = null;
  let waBizName:   string | null = null; // BUG #3: campo separado para o frontend

  if (userId) {
    const db = supabaseAdmin;
    // FIX BUG #3 + integrations/.single() → .maybeSingle() (não lança erro se userId não existir)
    const { data: user } = await db
      .from("users")
      .select("whatsapp_token, phone_number_id, display_phone, business_name, token_expires_at")
      .eq("id", userId)
      .maybeSingle<UserRow>();

    if (user?.whatsapp_token) {
      waDaysLeft   = daysUntil(user.token_expires_at);
      waActive     = (waDaysLeft ?? 1) > 0;
      waPhone      = user.display_phone ?? user.phone_number_id ?? waPhone;
      waBizName    = user.business_name ?? null; // BUG #3: expõe campo separado

      if (!waActive) {
        waStatus = "⚠️ Token expirado — reconecte";
      } else if ((waDaysLeft ?? 99) < 7) {
        waStatus = `⚠️ Token expira em ${waDaysLeft} dia(s)`;
      } else {
        waStatus = `✅ Conectado${user.business_name ? ` (${user.business_name})` : ""}`;
      }
    }
  } else {
    // Fallback: verifica token do .env via Meta API (compatibilidade legada)
    const waToken   = process.env.WHATSAPP_TOKEN    ?? "";
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    if (waToken && waPhoneId) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${waPhoneId}?fields=display_phone_number,quality_rating&access_token=${waToken}`,
          { signal: AbortSignal.timeout(5000) }
        );
        const data = await res.json() as Record<string, unknown>;
        if (data.error) {
          const e = data.error as Record<string, unknown>;
          waStatus = e.error_subcode === 463 ? "⚠️ Token expirado" : `❌ ${e.message}`;
        } else {
          waActive = true;
          waPhone  = (data.display_phone_number as string) ?? waPhoneId;
          waStatus = `✅ Conectado (${data.quality_rating ?? "N/A"})`;
        }
      } catch {
        waStatus = "⚠️ Timeout na verificação";
      }
    }
  }

  // ── Outras integrações (env vars) ──────────────────────────────────────────
  const evoUrl  = process.env.EVOLUTION_API_URL  ?? "";
  const igToken = process.env.IG_PAGE_TOKEN      ?? "";
  const groqKey = process.env.GROQ_API_KEY       ?? "";
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const metaAppId = process.env.META_APP_ID      ?? "";

  return NextResponse.json({
    whatsapp: {
      active:        waActive,
      status:        waStatus,
      phone:         waPhone,
      days_left:     waDaysLeft,
      business_name: waBizName,   // BUG #3: exposto para o frontend
      webhook:       "/api/webhook/whatsapp",
      connect_url:  "/api/meta/auth",
    },
    whatsapp_evolution: {
      active:   !!evoUrl,
      status:   evoUrl ? "✅ URL configurada" : "❌ EVOLUTION_API_URL não configurada",
      webhook:  "/api/webhook/evolution",
      instance: process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR",
      url:      evoUrl || "pendente",
    },
    instagram: {
      active:  igToken.length > 10 && !igToken.includes("SEU_"),
      status:  igToken.length > 10 ? "✅ Token configurado" : "❌ Token não configurado",
      webhook: "/api/webhook/instagram",
    },
    groq_ai: {
      active: groqKey.length > 10,
      status: groqKey.length > 10 ? "✅ Ativo" : "⚠️ Sem chave (fallback ativo)",
      model:  "llama-3.3-70b-versatile",
    },
    supabase: {
      active:  supaUrl.length > 10,
      status:  supaUrl.length > 10 ? "✅ Conectado" : "❌ Não configurado",
      project: supaUrl.replace("https://", "").split(".")[0] || "—",
    },
    oauth: {
      configured: !!metaAppId,
      status:     metaAppId ? "✅ META_APP_ID configurado" : "❌ META_APP_ID ausente",
    },
  });
}
