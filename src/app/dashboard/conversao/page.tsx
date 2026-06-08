"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Financeiro = {
  metaSpend: number; receita: number;
  cplFmt: string; cpqlFmt: string; cpaFmt: string; roasFmt: string;
  receitaFmt: string; metaSpendFmt: string;
  cpl: number | null; cpql: number | null; cpa: number | null; roas: number | null;
};

type Stats = {
  leads: {
    total: number; qualificados: number; vendidos: number;
    taxaConversao: string; scoreMedia: number;
    histogram: { frio: number; interessado: number; quente: number };
    porVendedor: Array<{ name: string; total: number; vendidos: number; taxa: string }>;
    porCampanha: Array<{ name: string; total: number }>;
    porVeiculo:  Array<{ name: string; total: number }>;
    porDia:      Array<{ date: string; total: number }>;
  };
  capi: {
    success: number; error: number;
    leads: number; qualifiedLeads: number; purchases: number;
    initiateConversations: number;
  };
  financeiro: Financeiro;
};

type RecalcResult = { total: number; updated: number; skipped: number; errors: number };
type LogEntry = {
  id: string; event_name: string; status: "success"|"error";
  events_received: number; error_msg: string|null; created_at: string; lead_id: string|null;
};

const COLORS = ["#ef4444", "#f59e0b", "#22c55e"];
const LS_SPEND = "ph_meta_spend";

// ── Componente ────────────────────────────────────────────────────────────────
export default function ConversaoDashboard() {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [logs,      setLogs]      = useState<LogEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [recalcing, setRecalcing] = useState(false);
  const [recalcRes, setRecalcRes] = useState<RecalcResult | null>(null);
  const [metaSpend, setMetaSpend] = useState<string>("0");

  const storeId = typeof window !== "undefined"
    ? (localStorage.getItem("storeId") ?? "")
    : "";

  // Carrega spend salvo no localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      setMetaSpend(localStorage.getItem(LS_SPEND) ?? "0");
    }
  }, []);

  async function load() {
    setLoading(true);
    try {
      const spend = parseFloat(metaSpend) || 0;
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/capi/stats?storeId=${storeId}&metaSpend=${spend}`),
        fetch(`/api/capi/logs?storeId=${storeId}&limit=20`),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (lRes.ok) setLogs(await lRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [metaSpend]);

  async function handleRecalc() {
    setRecalcing(true);
    setRecalcRes(null);
    try {
      const res = await fetch(`/api/capi/recalc?storeId=${storeId}`, { method: "POST" });
      const data = await res.json();
      setRecalcRes(data);
      await load(); // recarrega stats após recálculo
    } finally {
      setRecalcing(false);
    }
  }

  function handleSpendChange(val: string) {
    setMetaSpend(val);
    if (typeof window !== "undefined") localStorage.setItem(LS_SPEND, val);
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-zinc-400 animate-pulse">Carregando métricas...</div>
    </div>
  );

  if (!stats) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-red-400">Erro ao carregar dados.</div>
    </div>
  );

  const histData = [
    { name: "Frio",        value: stats.leads.histogram.frio,        color: "#ef4444" },
    { name: "Interessado", value: stats.leads.histogram.interessado, color: "#f59e0b" },
    { name: "Quente 🔥",   value: stats.leads.histogram.quente,      color: "#22c55e" },
  ];

  const fin = stats.financeiro;
  const roas = fin.roas ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📊 Dashboard de Conversão</h1>
          <p className="text-zinc-400 text-sm mt-1">Meta Ads × CRM 7Business — PH Autoscar</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Campo de investimento Meta */}
          <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
            <span className="text-zinc-400 text-sm">💸 Investimento Meta:</span>
            <span className="text-zinc-400 text-sm">R$</span>
            <input
              type="number"
              value={metaSpend}
              onChange={e => handleSpendChange(e.target.value)}
              className="bg-transparent text-white w-24 text-sm outline-none"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>
          <button
            onClick={handleRecalc}
            disabled={recalcing}
            className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
          >
            {recalcing ? "⏳ Recalculando..." : "🔁 Recalcular Scores"}
          </button>
          <button
            onClick={load}
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition"
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* Toast recálculo */}
      {recalcRes && (
        <div className="bg-purple-900 border border-purple-700 rounded-xl p-4 flex items-center gap-4">
          <span className="text-2xl">✅</span>
          <div>
            <div className="font-semibold text-purple-200">Recálculo concluído!</div>
            <div className="text-purple-300 text-sm">
              {recalcRes.total} leads analisados · <span className="text-green-400 font-bold">{recalcRes.updated} atualizados</span> · {recalcRes.skipped} sem histórico · {recalcRes.errors} erros
            </div>
          </div>
          <button onClick={() => setRecalcRes(null)} className="ml-auto text-purple-400 hover:text-white">✕</button>
        </div>
      )}

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Leads Recebidos"    value={stats.leads.total}        icon="📥" color="blue"   />
        <KPICard title="Leads Qualificados" value={stats.leads.qualificados} icon="🎯" color="yellow" sub="score ≥ 70" />
        <KPICard title="Vendas Fechadas"    value={stats.leads.vendidos}     icon="💰" color="green"  />
        <KPICard title="Taxa de Conversão"  value={stats.leads.taxaConversao} icon="📈" color="purple" sub={`Score médio: ${stats.leads.scoreMedia}`} />
      </div>

      {/* Métricas Financeiras */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          💹 Métricas Financeiras
          <span className="text-xs text-zinc-500">(baseado em R$ {parseFloat(metaSpend).toFixed(2)} de investimento)</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FinanceBox label="CPL" sub="Custo por Lead"   value={fin.cplFmt}  threshold={fin.cpl}  thresholds={[30, 60]} />
          <FinanceBox label="CPQL" sub="Custo por Lead Qualificado" value={fin.cpqlFmt} threshold={fin.cpql} thresholds={[80, 150]} />
          <FinanceBox label="CPA" sub="Custo por Venda"  value={fin.cpaFmt}  threshold={fin.cpa}  thresholds={[300, 800]} />
          <FinanceBox
            label="ROAS" sub="Retorno sobre investimento"
            value={fin.roasFmt}
            threshold={roas}
            thresholds={[2, 5]}
            invert
          />
        </div>
        {fin.receita > 0 && (
          <div className="mt-3 text-sm text-zinc-400">
            💰 Receita total: <span className="text-green-400 font-bold">{fin.receitaFmt}</span>
            {" "}· Investimento: <span className="text-zinc-300">{fin.metaSpendFmt}</span>
          </div>
        )}
      </div>

      {/* CAPI Status */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <span>📡 Funil CAPI — Meta recebeu:</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${stats.capi.error > 0 ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300"}`}>
            {stats.capi.error > 0 ? `⚠️ ${stats.capi.error} erros` : "✅ Saudável"}
          </span>
        </h2>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
          <span className="bg-zinc-800 px-2 py-1 rounded">💬 {stats.capi.initiateConversations} InitiateConversation</span>
          <span className="text-zinc-600">→</span>
          <span className="bg-blue-900 text-blue-300 px-2 py-1 rounded">📋 {stats.capi.leads} Lead</span>
          <span className="text-zinc-600">→</span>
          <span className="bg-yellow-900 text-yellow-300 px-2 py-1 rounded">🎯 {stats.capi.qualifiedLeads} QualifiedLead</span>
          <span className="text-zinc-600">→</span>
          <span className="bg-green-900 text-green-300 px-2 py-1 rounded">💰 {stats.capi.purchases} Purchase</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-4 text-center">
          <MetricBox label="Sucesso total"  value={stats.capi.success}       color="green"  />
          <MetricBox label="Erros"          value={stats.capi.error}         color="red"    />
          <MetricBox label="Lead"           value={stats.capi.leads}         color="blue"   />
          <MetricBox label="QualifiedLead"  value={stats.capi.qualifiedLeads} color="yellow" />
          <MetricBox label="Purchase"       value={stats.capi.purchases}     color="green"  />
        </div>
      </div>

      {/* Score histogram + Leads por dia */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="font-semibold mb-4">🌡️ Temperatura dos Leads</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={histData} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                  {histData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} leads`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {histData.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-zinc-300">{d.name}</span>
                  <span className="font-bold ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="font-semibold mb-4">📅 Leads por dia (últimos 30 dias)</h2>
          {stats.leads.porDia.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={stats.leads.porDia}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#3b82f6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-zinc-500 text-sm text-center py-8">Nenhum dado no período</div>
          )}
        </div>
      </div>

      {/* Por vendedor + Por campanha */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="font-semibold mb-4">👤 Performance por Vendedor</h2>
          {stats.leads.porVendedor.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 text-left">
                  <th className="pb-2">Vendedor</th><th className="pb-2 text-center">Leads</th>
                  <th className="pb-2 text-center">Vendas</th><th className="pb-2 text-right">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {stats.leads.porVendedor.map((v, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-2 text-zinc-200">{v.name}</td>
                    <td className="py-2 text-center text-zinc-300">{v.total}</td>
                    <td className="py-2 text-center text-green-400 font-bold">{v.vendidos}</td>
                    <td className="py-2 text-right text-yellow-400">{v.taxa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-zinc-500 text-sm text-center py-8">Nenhum dado disponível</div>
          )}
        </div>

        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="font-semibold mb-4">📣 Leads por Campanha</h2>
          {stats.leads.porCampanha.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.leads.porCampanha} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="total" fill="#8b5cf6" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-zinc-500 text-sm text-center py-8">Nenhum dado disponível</div>
          )}
        </div>
      </div>

      {/* Por veículo */}
      {stats.leads.porVeiculo.length > 0 && (
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="font-semibold mb-4">🚗 Leads por Veículo (Top 10)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.leads.porVeiculo}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#f59e0b" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Logs CAPI */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="font-semibold mb-4">🔍 Últimos Eventos CAPI</h2>
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 text-left">
                  <th className="pb-2">Evento</th><th className="pb-2">Status</th>
                  <th className="pb-2 text-center">Recebidos</th>
                  <th className="pb-2">Erro</th><th className="pb-2 text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-t border-zinc-800">
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.event_name === "Purchase"              ? "bg-green-900 text-green-300" :
                        log.event_name === "QualifiedLead"        ? "bg-yellow-900 text-yellow-300" :
                        log.event_name === "InitiateConversation" ? "bg-zinc-700 text-zinc-300" :
                                                                    "bg-blue-900 text-blue-300"
                      }`}>{log.event_name}</span>
                    </td>
                    <td className="py-2">
                      <span className={log.status === "success" ? "text-green-400" : "text-red-400"}>
                        {log.status === "success" ? "✅ OK" : "❌ Erro"}
                      </span>
                    </td>
                    <td className="py-2 text-center text-zinc-300">{log.events_received}</td>
                    <td className="py-2 text-red-400 text-xs max-w-xs truncate">{log.error_msg ?? "-"}</td>
                    <td className="py-2 text-right text-zinc-500 text-xs">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-zinc-500 text-sm text-center py-8">
            Nenhum evento CAPI ainda.<br />
            <span className="text-xs text-zinc-600">Aparecerão aqui quando leads chegarem via WhatsApp.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function KPICard({ title, value, icon, color, sub }: {
  title: string; value: string|number; icon: string;
  color: "blue"|"yellow"|"green"|"purple"; sub?: string;
}) {
  const bg: Record<string, string> = {
    blue: "from-blue-950 border-blue-800", yellow: "from-yellow-950 border-yellow-800",
    green: "from-green-950 border-green-800", purple: "from-purple-950 border-purple-800",
  };
  const val: Record<string, string> = {
    blue: "text-blue-300", yellow: "text-yellow-300", green: "text-green-300", purple: "text-purple-300",
  };
  return (
    <div className={`bg-gradient-to-br ${bg[color]} border rounded-xl p-5`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-3xl font-bold ${val[color]}`}>{value}</div>
      <div className="text-zinc-400 text-sm mt-1">{title}</div>
      {sub && <div className="text-zinc-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function MetricBox({ label, value, color }: {
  label: string; value: number; color: "blue"|"yellow"|"green"|"red";
}) {
  const c: Record<string, string> = {
    blue: "text-blue-300", yellow: "text-yellow-300", green: "text-green-300", red: "text-red-400",
  };
  return (
    <div className="bg-zinc-800 rounded-lg p-3">
      <div className={`text-2xl font-bold ${c[color]}`}>{value}</div>
      <div className="text-zinc-400 text-xs mt-1">{label}</div>
    </div>
  );
}

/** Caixa de métrica financeira com cor por threshold */
function FinanceBox({ label, sub, value, threshold, thresholds, invert = false }: {
  label: string; sub: string; value: string;
  threshold: number | null; thresholds: [number, number]; invert?: boolean;
}) {
  const getColor = () => {
    if (threshold === null || threshold === 0) return "text-zinc-400";
    const [good, bad] = thresholds;
    if (invert) {
      // ROAS: maior = melhor
      if (threshold >= bad)  return "text-green-400";
      if (threshold >= good) return "text-yellow-400";
      return "text-red-400";
    } else {
      // CPL/CPA: menor = melhor
      if (threshold <= good) return "text-green-400";
      if (threshold <= bad)  return "text-yellow-400";
      return "text-red-400";
    }
  };
  return (
    <div className="bg-zinc-800 rounded-lg p-4 text-center">
      <div className="text-zinc-400 text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${getColor()}`}>{value}</div>
      <div className="text-zinc-600 text-xs mt-1">{sub}</div>
    </div>
  );
}
