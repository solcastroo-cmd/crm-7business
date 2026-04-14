/**
 * GET    /api/integrations/webmotors?userId=xxx  → status
 * POST   /api/integrations/webmotors             → ativa (gera token)
 * DELETE /api/integrations/webmotors?userId=xxx  → desativa
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
    .select("webmotors_webhook_token, webmotors_active")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.webmotors_active || !user?.webmotors_webhook_token) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({ active: true, token: user.webmotors_webhook_token });
}

export async function POST(req: NextRequest) {
  let body: { userId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { userId } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("webmotors_webhook_token")
    .eq("id", userId)
    .maybeSingle();

  const token = existing?.webmotors_webhook_token || randomBytes(24).toString("hex");

  const { error } = await supabaseAdmin
    .from("users")
    .update({ webmotors_webhook_token: token, webmotors_active: true })
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
    .update({ webmotors_active: false })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ active: false });
}
