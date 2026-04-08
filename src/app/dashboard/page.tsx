"use client";

/**
 * 📊 Dashboard — Relatórios de vendas, leads e performance
 *
 * - Busca leads de /api/leads (client-side, sem nova API)
 * - Todos os gráficos computados via useMemo (zero requests extras)
 * - recharts + date-fns (já instalados)
 */

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { subDays, format, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Lead = {
  id: string; stage: string; source: string; seller: string | null;
  qualification: "quente" | "morno" | "frio" | null; created_at: string;
};

const STAGE_ORDER = ["Novo Lead","Contato Inicial","Interesse","Proposta","Negociação","VENDIDO!"];
const STAGE_COLOR: Record<string, string> = {
  "Novo Lead":       "#6b7280",
  "Contato Inicial": "#3b82f6",
  "Interesse":       "#8b5cf6",
  "Proposta":        "#14b8a6",
  "Negociação":      "#f59e0b",
  "VENDIDO!":        "#22c55e",
  "Perdido":         "#e63946",
};
const SOURCE_COLORS = ["#e63946","#3b82f6","#22c55e","#f59e0b","#8b5cf6","#14b8a6","#f97316"];

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <p className="text-xs uppercase tracking-wider font-medium mb-1" style={{ color: "#888" }}>{label}</p>
      <p className="text-2xl font-black" style={{ color: color ?? "#1a1a1a" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [leads,   setLeads]   = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const res = await fetch(`/api/leads?storeId=${userId}`);
      if (res.ok) setLeads(await res.json());
      setLoading(false);
    })();
  }, [userId]);

  // ── Métricas principais ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = leads.length;
    const vendidos  = leads.filter(l => l.stage === "VENDIDO!").length;
    const perdidos  = leads.filter(l => l.stage === "Perdido").length;
    const quentes   = leads.filter(l => l.qualification === "quente").length;
    const hoje      = leads.filter(l => startOfDay(parseISO(l.created_at)).getTime() === startOfDay(new Date()).getTime()).length;
    const taxa      = total > 0 ? ((vendidos / total) * 100).toFixed(1) : "0";
    return { total, vendidos, perdidos, quentes, hoje, taxa };
  }, [leads]);

  // ── Leads por dia (30 dias) ──────────────────────────────────────────────────
  const timelineData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const day   = subDays(new Date(), 29 - i);
      const label = format(day, "dd/MM", { locale: ptBR });
      const count = leads.filter(l =>
        startOfDay(parseISO(l.created_at)).getTime() === startOfDay(day).getTime()
      ).length;
      return { day: label, leads: count };
    });
  }, [leads]);

  // ── Funil por estágio ────────────────────────────────────────────────────────
  const funnelData = useMemo(() =>
    STAGE_ORDER.map(stage => ({
      stage: stage === "Contato Inicial" ? "Contato" : stage,
      count: leads.filter(l => l.stage === stage).length,
      fill:  STAGE_COLOR[stage],
    })).filter(d => d.count > 0),
  [leads]);

  // ── Por origem ───────────────────────────────────────────────────────────────
  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { map[l.source] = (map[l.source] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // ── Performance por vendedor ─────────────────────────────────────────────────
  const sellerData = useMemo(() => {
    const map: Record<string, { total: number; vendidos: number }> = {};
    leads.forEach(l => {
      const s = l.seller ?? "Sem vendedor";
      if (!map[s]) map[s] = { total: 0, vendidos: 0 };
      map[s].total++;
      if (l.stage === "VENDIDO!") map[s].vendidos++;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d, taxa: d.total > 0 ? ((d.vendidos/d.total)*100).toFixed(0) : "0" }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [leads]);

  // ── Qualificação ─────────────────────────────────────────────────────────────
  const qualData = useMemo(() => {
    const total = leads.length || 1;
    return [
      { label: "🔥 Quente", count: leads.filter(l => l.qualification === "quente").length, color: "#e63946" },
      { label: "⚡ Morno",  count: leads.filter(l => l.qualification === "morno").length,  color: "#f59e0b" },
      { label: "❄️ Frio",   count: leads.filter(l => l.qualification === "frio").length,   color: "#3b82f6" },
      { label: "Sem tag",   count: leads.filter(l => !l.qualification).length,              color: "#6b7280" },
    ].map(q => ({ ...q, pct: ((q.count / total) * 100).toFixed(0) }));
  }, [leads]);

  if (loading) return (
    <main className="min-h-screen p-6" style={{ background: "#1a1a1a" }}>
      <div className="animate-pulse space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl" style={{ background: "#232323" }} />)}
      </div>
    </main>
  );

  return (
    <main className="min-h-screen p-6" style={{ background: "#1a1a1a" }}>

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-xl font-bold text-white">📊 Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Performance de leads, vendas e equipe.</p>
      </header>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Leads"    value={stats.total}              sub="todos os tempos"   />
        <StatCard label="Vendidos"       value={stats.vendidos}           sub={`${stats.taxa}% conversão`} color="#22c55e" />
        <StatCard label="Leads Quentes"  value={stats.quentes}            sub="prontos para fechar" color="#e63946" />
        <StatCard label="Hoje"           value={stats.hoje}               sub="novos hoje"        />
      </div>

      {/* ── Qualificação mini-cards ── */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {qualData.map(q => (
          <div key={q.label} className="rounded-xl p-3 text-center"
            style={{ background: q.color + "18", border: `1px solid ${q.color}40` }}>
            <p className="text-xs font-medium" style={{ color: q.color }}>{q.label}</p>
            <p className="text-xl font-black" style={{ color: q.color }}>{q.count}</p>
            <p className="text-[10px]" style={{ color: q.color + "cc" }}>{q.pct}%</p>
          </div>
        ))}
      </div>

      {/* ── Gráfico: Leads por dia ── */}
      <div className="rounded-xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "#1a1a1a" }}>📈 Leads por dia (últimos 30 dias)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#e63946" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#e63946" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#aaa" }} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: "#aaa" }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 12 }} />
            <Area type="monotone" dataKey="leads" stroke="#e63946" strokeWidth={2} fill="url(#grad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Gráfico: Funil + Origem (2 colunas) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Funil por estágio */}
        <div className="rounded-xl p-5" style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "#1a1a1a" }}>🏗️ Funil de Vendas</h2>
          {funnelData.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Nenhum lead encontrado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "#aaa" }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10, fill: "#555" }} width={80} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 12 }} />
                <Bar dataKey="count" radius={[0,4,4,0]}>
                  {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Origem dos leads */}
        <div className="rounded-xl p-5" style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "#1a1a1a" }}>🌐 Origem dos Leads</h2>
          {sourceData.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Nenhum lead encontrado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {sourceData.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "#555", fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Performance por vendedor ── */}
      {sellerData.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "#1a1a1a" }}>👥 Performance por Vendedor</h2>
          <div className="space-y-3">
            {sellerData.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-28 text-xs font-medium truncate" style={{ color: "#333" }}>{s.name}</div>
                <div className="flex-1 rounded-full overflow-hidden" style={{ background: "#f0f0f0", height: 8 }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max((s.total / (sellerData[0]?.total || 1)) * 100, 4)}%`, background: "#e63946" }} />
                </div>
                <div className="text-xs w-16 text-right" style={{ color: "#888" }}>
                  {s.total} leads
                </div>
                <div className="text-xs w-14 text-right font-semibold" style={{ color: "#22c55e" }}>
                  {s.vendidos} vendas
                </div>
                <div className="text-xs w-10 text-right" style={{ color: "#aaa" }}>
                  {s.taxa}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}
