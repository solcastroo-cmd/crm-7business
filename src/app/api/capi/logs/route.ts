/**
 * GET /api/capi/logs?storeId=xxx&limit=50
 * Retorna logs da CAPI para o dashboard de conversão.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const limit   = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

    let query = supabaseAdmin
      .from("capi_logs")
      .select("id, event_name, status, events_received, error_msg, created_at, lead_id")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
