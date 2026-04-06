import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ── /api/metrics — Métricas do dashboard hero (FEAT-01) ──────────────────────
// Retorna 4 KPIs calculados no banco:
//   1. leads_ativos      — total de leads NÃO em "Perdido" ou "VENDIDO!"
//   2. leads_hoje        — leads criados hoje (meia-noite local UTC-3)
//   3. leads_ontem       — leads criados ontem (comparação)
//   4. taxa_conversao    — % de leads que chegaram a "VENDIDO!" sobre total
//   5. tempo_medio_h     — média de horas entre created_at e updated_at (proxy de 1ª resposta)
//
// Todas as queries rodam via supabaseAdmin (service role) — sem RLS block.

export async function GET() {
  try {
    // ── 1. Total de leads ativos (excluindo finalizados) ────────────────────
    const { count: ativos, error: e1 } = await supabaseAdmin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .not("stage", "in", '("VENDIDO!","Perdido")');

    if (e1) throw e1;

    // ── 2. Leads criados hoje e ontem (UTC-3 → offset 3h) ──────────────────
    // Usamos timestamptz; o banco armazena em UTC.
    // Hoje começa às 03:00 UTC (meia-noite BRT).
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0)
    );
    // Se ainda é antes das 03:00 UTC (antes da meia-noite BRT) recua um dia
    if (now.getUTCHours() < 3) {
      todayStart.setUTCDate(todayStart.getUTCDate() - 1);
    }
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const [{ count: hoje, error: e2 }, { count: ontem, error: e3 }] =
      await Promise.all([
        supabaseAdmin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString()),
        supabaseAdmin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .gte("created_at", yesterdayStart.toISOString())
          .lt("created_at", todayStart.toISOString()),
      ]);

    if (e2) throw e2;
    if (e3) throw e3;

    // ── 3. Taxa de conversão: VENDIDO! / total ──────────────────────────────
    const [{ count: total, error: e4 }, { count: vendidos, error: e5 }] =
      await Promise.all([
        supabaseAdmin.from("leads").select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("stage", "VENDIDO!"),
      ]);

    if (e4) throw e4;
    if (e5) throw e5;

    const taxa_conversao =
      total && total > 0
        ? Math.round(((vendidos ?? 0) / total) * 1000) / 10  // 1 casa decimal
        : 0;

    // ── 4. Tempo médio de 1ª resposta (proxy: updated_at - created_at) ──────
    // "Resposta" = qualquer mudança no lead após criação.
    // Exclui leads cujo updated_at ≈ created_at (nunca tocados).
    // Resultado em horas, 1 casa decimal.
    const { data: tempoRows, error: e6 } = await supabaseAdmin
      .from("leads")
      .select("created_at, updated_at")
      .neq("stage", "Novo Lead")   // só leads que foram movidos pelo menos 1x
      .limit(500);                  // cap para não varrer a tabela inteira

    if (e6) throw e6;

    let tempo_medio_h = 0;
    if (tempoRows && tempoRows.length > 0) {
      const diffs = tempoRows
        .map((r) => {
          const created = new Date(r.created_at).getTime();
          const updated = new Date(r.updated_at).getTime();
          return (updated - created) / 3_600_000; // ms → horas
        })
        .filter((h) => h > 0 && h < 720); // descarta absurdos (>30 dias)

      if (diffs.length > 0) {
        const soma = diffs.reduce((acc, h) => acc + h, 0);
        tempo_medio_h = Math.round((soma / diffs.length) * 10) / 10;
      }
    }

    // ── Resposta final ───────────────────────────────────────────────────────
    return NextResponse.json({
      leads_ativos:   ativos   ?? 0,
      leads_hoje:     hoje     ?? 0,
      leads_ontem:    ontem    ?? 0,
      taxa_conversao,           // %
      tempo_medio_h,            // horas
      total_leads:    total    ?? 0,
      total_vendidos: vendidos ?? 0,
      computed_at:    new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
