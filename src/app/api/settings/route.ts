/**
 * ⚙️ /api/settings — Configurações do usuário/loja
 *
 * GET  ?userId=xxx  → retorna dados da loja
 * PATCH             → atualiza business_name, notify_phone, sellers
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/settings?userId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: "userId inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, business_name, notify_phone, sellers")
    .eq("id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}

// PATCH /api/settings
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, business_name, notify_phone, sellers } = body;

    if (!userId || !UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (business_name !== undefined) updates.business_name = business_name;
    if (notify_phone  !== undefined) updates.notify_phone  = notify_phone;
    if (sellers       !== undefined) updates.sellers       = sellers; // array JSON

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert({ id: userId, ...updates })
      .eq("id", userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}
