import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 30_000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId") || null;
  const cacheKey = storeId ?? "global";

  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    // 1. Leads ativos
    const ativosBase = supabaseAdmin.from("leads").select("*", { count: "exact", head: true }).not("stage", "in", '("VENDIDO!","Perdido")');
    const { count: ativos, error: e1 } = await (storeId ? ativosBase.eq("store_id", storeId) : ativosBase);
    if (e1) throw e1;

    // 2. Hoje / ontem (UTC-3)
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0));
    if (now.getUTCHours() < 3) todayStart.setUTCDate(todayStart.getUTCDate() - 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const baseHoje   = supabaseAdmin.from("leads").select("*", { count: "exact", head: true });
    const baseOntem  = supabaseAdmin.from("leads").select("*", { count: "exact", head: true });
    const baseTotal  = supabaseAdmin.from("leads").select("*", { count: "exact", head: true });
    const baseVend   = supabaseAdmin.from("leads").select("*", { count: "exact", head: true });
    const baseTempo  = supabaseAdmin.from("leads").select("created_at,updated_at");

    const hojeQ  = storeId ? baseHoje.eq("store_id", storeId)  : baseHoje;
    const ontemQ = storeId ? baseOntem.eq("store_id", storeId) : baseOntem;
    const totQ   = storeId ? baseTotal.eq("store_id", storeId) : baseTotal;
    const venQ   = storeId ? baseVend.eq("store_id", storeId)  : baseVend;
    const tmpQ   = storeId ? baseTempo.eq("store_id", storeId) : baseTempo;

    const [
      { count: hoje,    error: e2 },
      { count: ontem,   error: e3 },
      { count: total,   error: e4 },
      { count: vendidos,error: e5 },
    ] = await Promise.all([
      hojeQ.gte("created_at", todayStart.toISOString()),
      ontemQ.gte("created_at", yesterdayStart.toISOString()).lt("created_at", todayStart.toISOString()),
      totQ,
      venQ.eq("stage", "VENDIDO!"),
    ]);
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    if (e5) throw e5;

    const taxa_conversao = total && total > 0
      ? Math.round(((vendidos ?? 0) / total) * 1000) / 10
      : 0;

    // 3. Tempo médio
    const { data: tempoRows, error: e6 } = await tmpQ.neq("stage", "Novo Lead").limit(500);
    if (e6) throw e6;

    let tempo_medio_h = 0;
    if (tempoRows?.length) {
      const diffs = (tempoRows as { created_at: string; updated_at: string }[])
        .map(r => (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
        .filter(h => h > 0 && h < 720);
      if (diffs.length) tempo_medio_h = Math.round((diffs.reduce((a, h) => a + h, 0) / diffs.length) * 10) / 10;
    }

    const payload = {
      leads_ativos:   ativos   ?? 0,
      leads_hoje:     hoje     ?? 0,
      leads_ontem:    ontem    ?? 0,
      taxa_conversao,
      tempo_medio_h,
      total_leads:    total    ?? 0,
      total_vendidos: vendidos ?? 0,
      computed_at:    new Date().toISOString(),
    };
    _cache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
