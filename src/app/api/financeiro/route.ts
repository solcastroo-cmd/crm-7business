import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { data: vehicles, error } = await supabaseAdmin
    .from("vehicles")
    .select("id,brand,model,year,plate,color,status,photos,purchase_price,actual_sale_price,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: expenses, error: expError } = await supabaseAdmin
    .from("vehicle_expenses")
    .select("id,vehicle_id,date,category,description,amount")
    .order("date", { ascending: false });

  if (expError) {
    console.error("[financeiro] vehicle_expenses query error:", expError.message);
  }

  const expenseMap: Record<string, number> = {};
  const expenseDetails: Record<string, typeof expenses> = {};

  for (const e of expenses ?? []) {
    expenseMap[e.vehicle_id] = (expenseMap[e.vehicle_id] ?? 0) + Number(e.amount);
    if (!expenseDetails[e.vehicle_id]) expenseDetails[e.vehicle_id] = [];
    expenseDetails[e.vehicle_id]!.push(e);
  }

  const result = (vehicles ?? []).map(v => ({
    ...v,
    total_expenses: expenseMap[v.id] ?? 0,
    expenses:       expenseDetails[v.id] ?? [],
  }));

  return NextResponse.json(result);
}
