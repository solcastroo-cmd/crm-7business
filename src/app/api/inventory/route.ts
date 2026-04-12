/**
 * 🚗 /api/inventory — CRUD completo de veículos
 *
 * GET    → lista todos os veículos
 * POST   → cria novo veículo
 * PATCH  → atualiza veículo por ?id=
 * DELETE → remove veículo por ?id=
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Campos aceitos no payload
const FIELDS = [
  "brand","model","year","plate","price","price_fipe","color","km",
  "fuel","transmission","body_type","doors","end_plate",
  "renavam","chassis","ipva_paid","single_owner","has_manual","has_key",
  "optional_items","description","status",
] as const;

function buildPayload(body: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    // booleanos
    if (["ipva_paid","single_owner","has_manual","has_key"].includes(f)) {
      p[f] = Boolean(body[f]);
    // arrays
    } else if (f === "optional_items") {
      p[f] = Array.isArray(body[f]) ? body[f] : null;
    // inteiros
    } else if (f === "doors") {
      p[f] = body[f] ? Number(body[f]) : null;
    // numéricos com possível formatação BRL (ex: "45.000,50" → 45000.50)
    } else if (f === "price" || f === "price_fipe") {
      const raw = String(body[f] ?? "").replace(/\./g, "").replace(",", ".");
      const n = parseFloat(raw);
      p[f] = isNaN(n) ? null : n;
    } else if (f === "km") {
      const raw = String(body[f] ?? "").replace(/\D/g, "");
      p[f] = raw ? parseInt(raw, 10) : null;
    } else {
      p[f] = body[f] ?? null;
    }
  }
  return p;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status  = searchParams.get("status");
  const storeId = searchParams.get("storeId");

  let query = supabaseAdmin.from("vehicles").select("*");
  if (storeId) query = query.eq("store_id", storeId);
  if (status)  query = query.eq("status", status);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  if (!body.brand || !body.model) {
    return NextResponse.json({ error: "Marca e modelo são obrigatórios" }, { status: 400 });
  }
  if (!body.storeId) {
    return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 });
  }

  const payload = { ...buildPayload(body), store_id: body.storeId };
  const { data, error } = await supabaseAdmin.from("vehicles").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const payload = buildPayload(body);
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("vehicles").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin.from("vehicles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
