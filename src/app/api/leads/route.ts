import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Colunas válidas do Kanban — BUG #3: stage deve ser validado contra esta lista
const VALID_STAGES = ["Novo Lead", "Contato Inicial", "Interesse", "Proposta", "Negociação", "VENDIDO!", "Perdido"];

const ALLOWED_PATCH_FIELDS = ["name", "stage", "source", "budget", "type", "payment", "seller", "veiculo_interesse_id", "position", "notes"];

// BUG #1: valida se storeId é um UUID antes de enviar ao banco
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/leads?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    // BUG #1 FIX: rejeita storeId malformado antes de chegar no Supabase (evita 500)
    if (storeId && !UUID_REGEX.test(storeId)) {
      return NextResponse.json({ error: "storeId deve ser um UUID válido" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("leads")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;

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
    const { phone, name, stage = "Novo Lead", source = "manual", store_id } = body;

    if (!phone || typeof phone !== "string" || phone.trim() === "") {
      return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
    }

    // BUG #3 FIX: valida stage também no POST
    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: `stage inválido. Use: ${VALID_STAGES.join(", ")}` }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert([{ phone: phone.trim(), name, stage, source, store_id: store_id ?? null }])
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

    // BUG #3 FIX: valida stage contra lista de valores permitidos
    if (updates.stage !== undefined && !VALID_STAGES.includes(updates.stage as string)) {
      return NextResponse.json({ error: `stage inválido. Use: ${VALID_STAGES.join(", ")}` }, { status: 400 });
    }

    // BUG #2 FIX: position deve ser número >= 0
    if (updates.position !== undefined) {
      const pos = Number(updates.position);
      if (isNaN(pos) || pos < 0) {
        return NextResponse.json({ error: "position deve ser um número >= 0" }, { status: 400 });
      }
      updates.position = pos;
    }

    const { data, error } = await supabaseAdmin
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

    const { error } = await supabaseAdmin.from("leads").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro interno ao deletar lead" }, { status: 500 });
  }
}
