import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("consignment_contracts")
    .select(`*, consignment_photos(id, url, label)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, ...fields } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("consignment_contracts")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
