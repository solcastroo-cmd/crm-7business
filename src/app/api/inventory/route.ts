import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const FIELDS = [
  "brand","model","year","plate","price","price_fipe","color","km",
  "fuel","transmission","body_type","doors","end_plate",
  "renavam","chassis","ipva_paid","single_owner","has_manual","has_key",
  "optional_items","description","status","user_id",
] as const;

function buildPayload(body: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    if (["ipva_paid","single_owner","has_manual","has_key"].includes(f)) {
      p[f] = Boolean(body[f]);
    } else if (f === "optional_items") {
      p[f] = Array.isArray(body[f]) ? body[f] : null;
    } else if (f === "doors") {
      p[f] = body[f] ? Number(body[f]) : null;
    } else if (f === "price" || f === "price_fipe" || f === "km" || f === "year") {
      const raw = String(body[f] ?? "").replace(/[^\d]/g, "");
      p[f] = raw ? Number(raw) : null;
    } else {
      p[f] = body[f] ?? null;
    }
  }
  return p;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  let query = supabaseAdmin.from("vehicles").select("*");
  if (status) query = query.eq("status", status);
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body invalido" }, { status: 400 }); }
  if (!body.brand || !body.model) return NextResponse.json({ error: "Marca e modelo sao obrigatorios" }, { status: 400 });
  const payload = buildPayload(body);
  const { data, error } = await supabaseAdmin.from("vehicles").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body invalido" }, { status: 400 }); }
  const payload = buildPayload(body);
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("vehicles").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const { error } = await supabaseAdmin.from("vehicles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
