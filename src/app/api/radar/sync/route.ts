import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId } from "@/lib/radar/ig";
import { syncStore } from "@/lib/radar/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron diário (Vercel envia Authorization: Bearer CRON_SECRET)
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("authorization")?.replace("Bearer ", "") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: conns } = await supabaseAdmin.from("radar_connections").select("store_id");
  const out: Record<string, unknown> = {};
  for (const c of conns ?? []) out[c.store_id] = await syncStore(c.store_id);
  return NextResponse.json({ ok: true, out });
}

// Botão "Atualizar" da tela
export async function POST() {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: conn } = await supabaseAdmin.from("radar_connections").select("last_sync_at").eq("store_id", storeId).maybeSingle();
  if (conn?.last_sync_at && Date.now() - new Date(conn.last_sync_at).getTime() < 60_000) {
    return NextResponse.json({ ok: true, skipped: true, novasOportunidades: 0, concorrentes: 0, erros: [] });
  }
  return NextResponse.json({ ok: true, ...(await syncStore(storeId)) });
}
