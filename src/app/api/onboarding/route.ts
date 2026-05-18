/**
 * POST /api/onboarding
 * Finaliza o onboarding: salva dados da loja, credenciais Z-API e ativa o agente Paulo.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      business_name,
      notify_phone,
      zapi_instance,
      zapi_token,
      zapi_client_token,
      zapi_phone,
    } = body;

    if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        business_name:     business_name     || null,
        notify_phone:      notify_phone      || null,
        zapi_instance:     zapi_instance     || null,
        zapi_token:        zapi_token        || null,
        zapi_client_token: zapi_client_token || null,
        zapi_phone:        zapi_phone        || null,
        ai_enabled:        true,
        ai_name:           "Paulo",
        plan:              "trial",
        updated_at:        new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}
