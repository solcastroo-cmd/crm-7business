import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const waToken    = process.env.WHATSAPP_TOKEN ?? "";
  const waPhoneId  = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const igToken    = process.env.IG_PAGE_TOKEN ?? "";
  const evoUrl     = process.env.EVOLUTION_API_URL ?? "";
  const groqKey    = process.env.GROQ_API_KEY ?? "";
  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  // Verifica token WhatsApp na Meta API
  let waStatus = "❌ Token ausente";
  let waPhone  = waPhoneId;
  if (waToken && waPhoneId) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${waPhoneId}?fields=display_phone_number,verified_name,status,quality_rating&access_token=${waToken}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json() as Record<string, unknown>;
      if (data.error) {
        const err = data.error as Record<string, unknown>;
        waStatus = err.error_subcode === 463 ? "⚠️ Token expirado" : `❌ ${err.message}`;
      } else {
        waPhone  = data.display_phone_number as string ?? waPhoneId;
        waStatus = `✅ Conectado (${data.quality_rating ?? "N/A"})`;
      }
    } catch {
      waStatus = "⚠️ Timeout na verificação";
    }
  }

  return NextResponse.json({
    whatsapp_meta: {
      active:       waToken.length > 10,
      status:       waStatus,
      phone:        waPhone,
      webhook:      "/api/webhook/whatsapp",
      verify_token: process.env.WA_VERIFY_TOKEN ?? "7business_wa_token",
    },
    whatsapp_evolution: {
      active:   !!evoUrl,
      status:   evoUrl ? "✅ URL configurada" : "❌ URL não configurada",
      webhook:  "/api/webhook/evolution",
      instance: process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR",
      url:      evoUrl || "pendente",
    },
    instagram: {
      active:       igToken.length > 10 && !igToken.includes("SEU_"),
      status:       igToken.length > 10 && !igToken.includes("SEU_") ? "✅ Token configurado" : "❌ Token não configurado",
      webhook:      "/api/webhook/instagram",
      verify_token: process.env.IG_VERIFY_TOKEN ?? "7business_ig_token",
    },
    groq_ai: {
      active: groqKey.length > 10,
      status: groqKey.length > 10 ? "✅ Chave configurada" : "⚠️ Sem chave (usando fallback)",
      model:  "llama-3.3-70b-versatile",
    },
    supabase: {
      active:  supaUrl.length > 10,
      status:  supaUrl.length > 10 ? "✅ Conectado" : "❌ Não configurado",
      project: supaUrl.replace("https://", "").split(".")[0] || "—",
    },
  });
}
