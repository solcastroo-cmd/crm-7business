/**
 * GET    /api/integrations/olx?userId=xxx  → status da integração OLX
 * POST   /api/integrations/olx             → ativa integração (gera token único)
 * DELETE /api/integrations/olx?userId=xxx  → desativa
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ active: false, error: "userId obrigatório" }, { status: 400 });

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("olx_webhook_token, olx_active")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.olx_active || !user?.olx_webhook_token) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({ active: true, token: user.olx_webhook_token });
}

export async function POST(req: NextRequest) {
  let body: { userId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { userId } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  // Verifica se já tem token, senão gera um novo
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("olx_webhook_token")
    .eq("id", userId)
    .maybeSingle();

  const token = existing?.olx_webhook_token || randomBytes(24).toString("hex");

  const { error } = await supabaseAdmin
    .from("users")
    .update({ olx_webhook_token: token, olx_active: true })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ active: true, token });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ olx_active: false })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ active: false });
}
