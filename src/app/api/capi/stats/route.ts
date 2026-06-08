/**
 * GET /api/capi/stats?storeId=xxx
 * Retorna métricas agregadas para o dashboard de conversão.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ── Métricas financeiras ──────────────────────────────────────────────────────
function calcFinanceiro(
  spend:        number,
  total:        number,
  qualificados: number,
  vendidos:     number,
  leads:        Array<{ sale_value?: number | null }>,
) {
  const receita = leads.reduce((s, l) => s + (l.sale_value ? Number(l.sale_value) : 0), 0);
  const fmt = (v: number) => v > 0 ? `R$ ${v.toFixed(2)}` : "—";

  return {
    metaSpend:    spend,
    receita,
    cpl:          spend > 0 && total > 0        ? spend / total         : null,
    cpql:         spend > 0 && qualificados > 0  ? spend / qualificados  : null,
    cpa:          spend > 0 && vendidos > 0       ? spend / vendidos      : null,
    roas:         spend > 0 && receita > 0        ? receita / spend       : null,
    cplFmt:       spend > 0 && total > 0        ? fmt(spend / total)         : "—",
    cpqlFmt:      spend > 0 && qualificados > 0  ? fmt(spend / qualificados)  : "—",
    cpaFmt:       spend > 0 && vendidos > 0       ? fmt(spend / vendidos)      : "—",
    roasFmt:      spend > 0 && receita > 0        ? `${(receita / spend).toFixed(2)}x` : "—",
    receitaFmt:   fmt(receita),
    metaSpendFmt: fmt(spend),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId   = searchParams.get("storeId");
    const metaSpend = parseFloat(searchParams.get("metaSpend") ?? "0") || 0;

    const buildLeadQ = () => {
      let q = supabaseAdmin.from("leads").select("*");
      if (storeId) q = q.eq("store_id", storeId);
      return q;
    };

    const buildLogQ = () => {
      let q = supabaseAdmin.from("capi_logs").select("*");
      if (storeId) q = q.eq("store_id", storeId);
      return q;
    };

    const [leadsRes, logsRes] = await Promise.all([
      buildLeadQ(),
      buildLogQ(),
    ]);

    const leads = leadsRes.data ?? [];
    const logs  = logsRes.data  ?? [];

    // ── Métricas de leads ──────────────────────────────────────────────────
    const total         = leads.length;
    const qualificados  = leads.filter(l => (l.score ?? 0) >= 70).length;
    const vendidos      = leads.filter(l => l.stage === "VENDIDO!").length;
    const taxaConversao = total > 0 ? ((vendidos / total) * 100).toFixed(1) : "0.0";
    const scoreMedia    = total > 0
      ? (leads.reduce((s, l) => s + (l.score ?? 0), 0) / total).toFixed(0)
      : "0";

    // ── Por vendedor ───────────────────────────────────────────────────────
    const porVendedor: Record<string, { total: number; vendidos: number }> = {};
    leads.forEach(l => {
      const v = l.seller ?? "Sem vendedor";
      if (!porVendedor[v]) porVendedor[v] = { total: 0, vendidos: 0 };
      porVendedor[v].total++;
      if (l.stage === "VENDIDO!") porVendedor[v].vendidos++;
    });

    // ── Por campanha (utm_campaign) ────────────────────────────────────────
    const porCampanha: Record<string, number> = {};
    leads.forEach(l => {
      const c = l.utm_campaign ?? l.source ?? "whatsapp";
      porCampanha[c] = (porCampanha[c] ?? 0) + 1;
    });

    // ── Por veículo ────────────────────────────────────────────────────────
    const porVeiculo: Record<string, number> = {};
    leads.forEach(l => {
      if (l.vehicle_name) {
        porVeiculo[l.vehicle_name] = (porVeiculo[l.vehicle_name] ?? 0) + 1;
      }
    });

    // ── Logs CAPI ──────────────────────────────────────────────────────────
    const capiSuccess  = logs.filter(l => l.status === "success").length;
    const capiError    = logs.filter(l => l.status === "error").length;
    const capiLeads    = logs.filter(l => l.event_name === "Lead"          && l.status === "success").length;
    const capiQLeads   = logs.filter(l => l.event_name === "QualifiedLead" && l.status === "success").length;
    const capiPurchase = logs.filter(l => l.event_name === "Purchase"      && l.status === "success").length;

    // ── Score histogram ────────────────────────────────────────────────────
    const histogram = { frio: 0, interessado: 0, quente: 0 };
    leads.forEach(l => {
      const s = l.score ?? 0;
      if (s < 30)      histogram.frio++;
      else if (s < 70) histogram.interessado++;
      else             histogram.quente++;
    });

    // ── Últimos 30 dias — leads por dia ───────────────────────────────────
    const leadsPorDia: Record<string, number> = {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    leads
      .filter(l => new Date(l.created_at) >= cutoff)
      .forEach(l => {
        const day = l.created_at.slice(0, 10);
        leadsPorDia[day] = (leadsPorDia[day] ?? 0) + 1;
      });

    return NextResponse.json({
      leads: {
        total, qualificados, vendidos,
        taxaConversao: `${taxaConversao}%`,
        scoreMedia: Number(scoreMedia),
        histogram,
        porVendedor: Object.entries(porVendedor).map(([name, v]) => ({
          name, ...v,
          taxa: v.total > 0 ? `${((v.vendidos / v.total) * 100).toFixed(0)}%` : "0%",
        })),
        porCampanha: Object.entries(porCampanha)
          .sort((a, b) => b[1] - a[1])
          .map(([name, total]) => ({ name, total })),
        porVeiculo: Object.entries(porVeiculo)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, total]) => ({ name, total })),
        porDia: Object.entries(leadsPorDia)
          .sort()
          .map(([date, total]) => ({ date, total })),
      },
      capi: {
        success: capiSuccess, error: capiError,
        leads: capiLeads, qualifiedLeads: capiQLeads, purchases: capiPurchase,
        initiateConversations: logs.filter(l => l.event_name === "InitiateConversation" && l.status === "success").length,
      },
      financeiro: calcFinanceiro(metaSpend, total, qualificados, vendidos, leads),
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
