import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/* ── GET — lista despesas + consolidado opcional ── */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const mode = url.searchParams.get("mode"); // "report" para consolidado

  if (mode === "report") {
    // Consolidado: store_expenses + vehicle_expenses + sales
    const [seRes, veRes, saleRes] = await Promise.all([
      supabaseAdmin
        .from("store_expenses")
        .select("*")
        .order("date", { ascending: false }),
      supabaseAdmin
        .from("vehicle_expenses")
        .select("id,vehicle_id,date,category,description,amount,created_at")
        .order("date", { ascending: false }),
      supabaseAdmin
        .from("sales")
        .select("id,vehicle_id,total_value,closing_date,status,payment_method,buyer_name")
        .order("closing_date", { ascending: false }),
    ]);

    return NextResponse.json({
      store_expenses:   seRes.data  ?? [],
      vehicle_expenses: veRes.data  ?? [],
      sales:            saleRes.data ?? [],
    });
  }

  // Listagem simples das despesas da loja
  const { data, error } = await supabaseAdmin
    .from("store_expenses")
    .select("*")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/* ── POST — criar despesa ── */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    store_id, date, description, category, amount,
    payment_method, status, receipt_url, notes,
  } = body;

  if (!description || !category || !amount) {
    return NextResponse.json(
      { error: "description, category e amount são obrigatórios" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("store_expenses")
    .insert({
      store_id: store_id ?? null,
      date: date || new Date().toISOString().split("T")[0],
      description,
      category,
      amount: Number(amount),
      payment_method: payment_method || "pix",
      status: status || "pago",
      receipt_url: receipt_url ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/* ── PATCH — atualizar despesa ── */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = [
    "date","description","category","amount",
    "payment_method","status","receipt_url","notes",
  ];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }

  const { data, error } = await supabaseAdmin
    .from("store_expenses")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/* ── DELETE — remover despesa ── */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("store_expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
