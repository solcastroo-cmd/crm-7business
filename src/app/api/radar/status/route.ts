import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId } from "@/lib/radar/ig";

export const dynamic = "force-dynamic";

export async function GET() {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [{ data: conn }, opp, comp] = await Promise.all([
    supabaseAdmin.from("radar_connections")
      .select("ig_username, page_id, connected_at, last_sync_at, last_error").eq("store_id", storeId).maybeSingle(),
    supabaseAdmin.from("radar_opportunities").select("status, temperature").eq("store_id", storeId),
    supabaseAdmin.from("radar_competitors").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("active", true),
  ]);
  const rows = opp.data ?? [];
  return NextResponse.json({
    connected: !!conn,
    config: {
      appId: !!process.env.META_APP_ID?.trim(),
      appSecret: !!process.env.META_APP_SECRET?.trim(),
      groq: !!process.env.GROQ_API_KEY?.trim(),
    },
    connection: conn ?? null,
    totals: {
      novas: rows.filter(r => r.status === "novo").length,
      quentes: rows.filter(r => r.status === "novo" && r.temperature === "quente").length,
      convertidas: rows.filter(r => r.status === "convertido").length,
      concorrentes: comp.count ?? 0,
    },
  });
}
