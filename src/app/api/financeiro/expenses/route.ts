import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const vehicleId = req.nextUrl.searchParams.get("vehicle_id");
  if (!vehicleId) return NextResponse.json({ error: "vehicle_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("vehicle_expenses")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vehicle_id, store_id, date, category, description, amount } = body;

  if (!vehicle_id || !store_id || !category || amount == null) {
    return NextResponse.json({ error: "vehicle_id, store_id, category e amount são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("vehicle_expenses")
    .insert({ vehicle_id, store_id, date, category, description, amount: Number(amount) })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, date, category, description, amount } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("vehicle_expenses")
    .update({ date, category, description, amount: Number(amount) })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("vehicle_expenses")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
