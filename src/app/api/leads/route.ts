import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const ALLOWED_PATCH_FIELDS = ["name", "stage", "source", "budget", "type", "payment", "seller", "veiculo_interesse_id"];

// GET /api/leads
export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/leads
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, name, stage = "Novo Lead", source = "manual" } = body;

    if (!phone || typeof phone !== "string" || phone.trim() === "") {
      return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from("leads")
      .insert([{ phone: phone.trim(), name, stage, source }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}

// PATCH /api/leads
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...rawUpdates } = body;

    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const updates = Object.fromEntries(
      Object.entries(rawUpdates).filter(([key]) => ALLOWED_PATCH_FIELDS.includes(key))
    );

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar" }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
}

// DELETE /api/leads?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const { error } = await getSupabase().from("leads").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro interno ao deletar lead" }, { status: 500 });
  }
}
