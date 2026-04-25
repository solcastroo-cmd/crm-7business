import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store_id");
  if (!storeId) return NextResponse.json({ error: "store_id required" }, { status: 400 });

  const { data: vehicles, error } = await supabaseAdmin
    .from("vehicles")
    .select("id,brand,model,year,plate,color,status,photos,purchase_price,actual_sale_price,created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: expenses } = await supabaseAdmin
    .from("vehicle_expenses")
    .select("vehicle_id,amount")
    .eq("store_id", storeId);

  const expenseMap: Record<string, number> = {};
  for (const e of expenses ?? []) {
    expenseMap[e.vehicle_id] = (expenseMap[e.vehicle_id] ?? 0) + Number(e.amount);
  }

  const result = (vehicles ?? []).map(v => ({
    ...v,
    total_expenses: expenseMap[v.id] ?? 0,
  }));

  return NextResponse.json(result);
}
