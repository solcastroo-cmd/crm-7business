/**
 * 🚗 /api/inventory — CRUD de veículos (estoque)
 *
 * GET    → lista todos os veículos disponíveis
 * POST   → cria novo veículo
 * PATCH  → atualiza veículo por id
 * DELETE → remove veículo por id
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const FIELDS = ["brand","model","year","plate","price","color","km","fuel","transmission","description","status"] as const;

// GET /api/inventory
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/inventory
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.brand || !body.model) {
      return NextResponse.json({ error: "brand e model são obrigatórios" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) payload[f] = body[f] || null;
    if (body.price) payload.price = Number(String(body.price).replace(/\D/g, "")) || null;
    if (body.km)    payload.km    = Number(body.km) || null;

    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}

// PATCH /api/inventory
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) updates[f] = body[f] || null;
    if (body.price !== undefined) updates.price = Number(String(body.price).replace(/\D/g, "")) || null;
    if (body.km    !== undefined) updates.km    = Number(body.km) || null;

    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}

// DELETE /api/inventory?id=xxx
export async function DELETE(req: NextRequest) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim() || null;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 }); // BUG-03 fix: status 400

  const { error } = await supabaseAdmin.from("vehicles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
