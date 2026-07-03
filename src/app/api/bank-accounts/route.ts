import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/* ── GET — lista contas bancárias ── */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/* ── POST — cadastrar conta bancária ── */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { store_id, name, balance, reference_date } = body;

  if (!name || balance === undefined || balance === null) {
    return NextResponse.json({ error: "name e balance são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .insert({
      store_id: store_id ?? null,
      name,
      balance: Number(balance),
      reference_date: reference_date || new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/* ── PATCH — atualizar conta bancária ── */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["name", "balance", "reference_date"];
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }

  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/* ── DELETE — remover conta bancária ── */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("bank_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
