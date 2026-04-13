/**
 * ⚙️ /api/settings — Configurações do usuário/loja
 *
 * GET  ?userId=xxx  → retorna dados da loja
 * PATCH             → atualiza campos da loja
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_FIELDS = [
  "id","email","business_name","notify_phone","sellers",
  "cnpj","store_phone","address","plan",
  "ai_enabled","ai_name","ai_personality",
].join(", ");

// GET /api/settings?userId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: "userId inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(SELECT_FIELDS)
    .eq("id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}

// PATCH /api/settings
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      business_name, notify_phone, sellers,
      cnpj, store_phone, address,
      ai_enabled, ai_name, ai_personality,
    } = body;

    if (!userId || !UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (business_name  !== undefined) updates.business_name  = business_name;
    if (notify_phone   !== undefined) updates.notify_phone   = notify_phone;
    if (sellers        !== undefined) updates.sellers        = sellers;
    if (cnpj           !== undefined) updates.cnpj           = cnpj;
    if (store_phone    !== undefined) updates.store_phone    = store_phone;
    if (address        !== undefined) updates.address        = address;
    if (ai_enabled     !== undefined) updates.ai_enabled     = ai_enabled;
    if (ai_name        !== undefined) updates.ai_name        = ai_name;
    if (ai_personality !== undefined) updates.ai_personality = ai_personality;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select(SELECT_FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}
