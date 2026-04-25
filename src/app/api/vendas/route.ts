import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { data: sales, error } = await supabaseAdmin
    .from("sales")
    .select("*")
    .order("closing_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!sales?.length) return NextResponse.json([]);

  // Busca dados dos veículos vinculados
  const vehicleIds = [...new Set(sales.map(s => s.vehicle_id))];
  const { data: vehicles } = await supabaseAdmin
    .from("vehicles")
    .select("id,brand,model,year,plate,color,km,chassis,renavam,photos,status")
    .in("id", vehicleIds);

  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]));

  const result = sales.map(s => ({
    ...s,
    vehicle: vehicleMap[s.vehicle_id] ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    vehicle_id, store_id, buyer_name, buyer_cpf, buyer_phone, buyer_address,
    payment_method, total_value, down_payment, installments_count,
    installment_value, closing_date, status, notes,
  } = body;

  if (!vehicle_id || !buyer_name || !payment_method || !total_value) {
    return NextResponse.json(
      { error: "vehicle_id, buyer_name, payment_method e total_value são obrigatórios" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("sales")
    .insert({
      vehicle_id, store_id, buyer_name, buyer_cpf, buyer_phone, buyer_address,
      payment_method, total_value: Number(total_value),
      down_payment: down_payment ? Number(down_payment) : 0,
      installments_count: installments_count ? Number(installments_count) : 1,
      installment_value: installment_value ? Number(installment_value) : null,
      closing_date: closing_date || new Date().toISOString().split("T")[0],
      status: status || "pago",
      notes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Marca veículo como vendido automaticamente
  await supabaseAdmin
    .from("vehicles")
    .update({ status: "vendido" })
    .eq("id", vehicle_id);

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = [
    "buyer_name","buyer_cpf","buyer_phone","buyer_address",
    "payment_method","total_value","down_payment","installments_count",
    "installment_value","closing_date","status","notes",
  ];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }

  const { data, error } = await supabaseAdmin
    .from("sales")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("sales").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
