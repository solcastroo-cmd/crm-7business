/**
 * 🔍 GET /api/debug/whatsapp?userId=xxx
 *
 * Endpoint de diagnóstico — mostra o estado completo da integração
 * WhatsApp de um usuário sem expor o token completo.
 *
 * Protegido por ?secret= para não ficar público.
 * Configure DEBUG_SECRET nas variáveis de ambiente.
 *
 * Exemplo:
 *   GET /api/debug/whatsapp?userId=abc-123&secret=meu_segredo
 */

import { NextRequest, NextResponse }                from "next/server";
import { supabaseAdmin }                            from "@/lib/supabaseAdmin";
import { checkTokenValidity, getStoreDebugInfo }    from "@/lib/whatsappDebug";

export const dynamic = "force-dynamic";

const DEBUG_SECRET = process.env.DEBUG_SECRET ?? "7business_debug";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // ── Proteção básica ────────────────────────────────────────────────────────
  const secret = searchParams.get("secret");
  if (secret !== DEBUG_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = searchParams.get("userId");

  // ── Modo: listar todas as lojas ───────────────────────────────────────────
  if (!userId) {
    const { data: allUsers, error } = await supabaseAdmin
      .from("users")
      .select("id, business_name, display_phone, phone_number_id, whatsapp_token, token_expires_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = (allUsers ?? []).map(u => ({
      userId:        u.id,
      businessName:  u.business_name ?? "(sem nome)",
      displayPhone:  u.display_phone  ?? "(não detectado)",
      phoneNumberId: u.phone_number_id ?? "(não configurado)",
      hasToken:      !!u.whatsapp_token,
      tokenPreview:  u.whatsapp_token ? `${u.whatsapp_token.substring(0, 8)}...` : null,
      tokenExpiresAt: u.token_expires_at,
      createdAt:     u.created_at,
    }));

    return NextResponse.json({
      total: summary.length,
      stores: summary,
      envPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "(não configurado)",
      waDebugMode: process.env.WA_DEBUG === "true",
    });
  }

  // ── Modo: diagnóstico de um userId específico ─────────────────────────────
  const info = await getStoreDebugInfo(userId);
  if (!info) {
    return NextResponse.json({ error: `userId "${userId}" não encontrado` }, { status: 404 });
  }

  // ── Verificação ao vivo: testa o token contra a Meta API ──────────────────
  let metaCheck: { ok: boolean; name?: string; error?: string } = { ok: false };
  try {
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("whatsapp_token")
      .eq("id", userId)
      .maybeSingle();

    if (userData?.whatsapp_token) {
      const metaRes  = await fetch(
        `https://graph.facebook.com/v19.0/me?access_token=${userData.whatsapp_token}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const metaData = await metaRes.json() as { id?: string; name?: string; error?: { message: string } };

      if (metaRes.ok && metaData.id) {
        metaCheck = { ok: true, name: metaData.name };
      } else {
        metaCheck = { ok: false, error: metaData.error?.message ?? `HTTP ${metaRes.status}` };
      }
    }
  } catch (e) {
    metaCheck = { ok: false, error: e instanceof Error ? e.message : "Timeout" };
  }

  return NextResponse.json({
    ...info,
    metaApiCheck: metaCheck,
    envPhoneId:   process.env.WHATSAPP_PHONE_NUMBER_ID ?? "(não configurado)",
    waDebugMode:  process.env.WA_DEBUG === "true",
    instructions: {
      enableDebugLogs: "Adicione WA_DEBUG=true nas variáveis de ambiente",
      testWebhook:     `curl -X POST https://crm-7business-production.up.railway.app/api/webhook/whatsapp -H 'Content-Type: application/json' -d '${JSON.stringify(buildTestPayload(info.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "SEU_PHONE_ID"))}'`,
    },
  });
}

// ── Monta payload de teste para curl ─────────────────────────────────────────
function buildTestPayload(phoneNumberId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "TEST_WABA_ID",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "TEST",
            phone_number_id: phoneNumberId,
          },
          contacts: [{ profile: { name: "Teste Debug" }, wa_id: "5585999990000" }],
          messages: [{
            from: "5585999990000",
            id: "wamid.TEST123",
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: "Olá, quero informações sobre carros" },
            type: "text",
          }],
        },
        field: "messages",
      }],
    }],
  };
}
