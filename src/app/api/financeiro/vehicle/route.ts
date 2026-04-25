import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, purchase_price, actual_sale_price } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .update({
      purchase_price: purchase_price != null ? Number(purchase_price) : null,
      actual_sale_price: actual_sale_price != null ? Number(actual_sale_price) : null,
    })
    .eq("id", id)
    .select("id,purchase_price,actual_sale_price")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
