import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId } from "@/lib/radar/ig";

export const dynamic = "force-dynamic";

const STATUSES = ["novo", "em_revisao", "convertido", "descartado"];

export async function GET(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "novo";
  let q = supabaseAdmin.from("radar_opportunities")
    .select("id, source, username, text, media_permalink, intent, score, temperature, vehicle_hint, summary, next_step, status, lead_id, detected_at, replied_at")
    .eq("store_id", storeId)
    .order("score", { ascending: false })
    .order("detected_at", { ascending: false })
    .limit(200);
  if (status !== "todas") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id, status } = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!id || !status || !STATUSES.includes(status)) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { error } = await supabaseAdmin.from("radar_opportunities").update({ status }).eq("id", id).eq("store_id", storeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
