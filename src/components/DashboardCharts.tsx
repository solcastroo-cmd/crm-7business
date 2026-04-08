"use client";

/**
 * 📊 DashboardCharts — Feature #4
 *
 * Seção colapsável com 4 gráficos calculados 100% client-side:
 *   1. Área   — Leads por dia (últimos 14 dias)
 *   2. Barras — Distribuição por etapa do Kanban
 *   3. Rosca  — Origem dos leads
 *   4. Cards  — Qualificação 🔥⚡❄️
 *
 * Zero chamada de API extra — recebe o array leads já em memória.
 */

import { useMemo, useState } from "react";
import { subDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";

import type { Lead } from "./LeadModal";

// ── Paletas ──────────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  "Novo Lead":       "#e63946",
  "Contato Inicial": "#457b9d",
  "Interesse":       "#a78bfa",
  "Proposta":        "#2a9d8f",
  "Negociação":      "#e9c46a",
  "VENDIDO!":        "#4ade80",
  "Perdido":         "#555555",
};

const SOURCE_PALETTE = [
  "#e63946","#457b9d","#2a9d8f","#e9c46a",
  "#a78bfa","#f59e0b","#10b981","#60a5fa",
];

// ── Tooltip customizado ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs"
      style={{ background: "#1e1e1e", border: "1px solid #333", color: "#fff" }}>
      <p className="font-semibold mb-0.5">{label}</p>
      <p style={{ color: "#e63946" }}>{payload[0].value} leads</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function DashboardCharts({ leads }: { leads: Lead[] }) {
  const [visible, setVisible] = useState(false);

  // ── 1. Leads por dia — últimos 14 dias ────────────────────────────────────
  const dataByDay = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const date = subDays(new Date(), 13 - i);
      const dayLabel = format(date, "dd/MM", { locale: ptBR });
      const count = leads.filter((l) => {
        try {
          return format(parseISO(l.created_at), "dd/MM") === dayLabel;
        } catch { return false; }
      }).length;
      return { day: dayLabel, leads: count };
    }),
    [leads]
  );

  // ── 2. Distribuição por etapa ─────────────────────────────────────────────
  const dataByStage = useMemo(() => {
    const STAGES = ["Novo Lead","Contato Inicial","Interesse","Proposta","Negociação","VENDIDO!","Perdido"];
    return STAGES
      .map((stage) => ({ stage, total: leads.filter((l) => l.stage === stage).length }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [leads]);

  // ── 3. Origem dos leads ────────────────────────────────────────────────────
  const dataBySource = useMemo(() => {
    const acc: Record<string, number> = {};
    leads.forEach((l) => { acc[l.source] = (acc[l.source] ?? 0) + 1; });
    return Object.entries(acc)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // ── 4. Qualificação ───────────────────────────────────────────────────────
  const qualCount = useMemo(() => ({
    quente: leads.filter((l) => l.qualification === "quente").length,
    morno:  leads.filter((l) => l.qualification === "morno").length,
    frio:   leads.filter((l) => l.qualification === "frio").length,
    sem:    leads.filter((l) => !l.qualification).length,
  }), [leads]);

  // ── Botão toggle ──────────────────────────────────────────────────────────
  if (!visible) {
    return (
      <button onClick={() => setVisible(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all mb-4 hover:opacity-90"
        style={{ background: "#1e1e1e", border: "1px solid #2e2e2e", color: "#888" }}>
        <span>📊</span> Ver Dashboard Analytics
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-xl p-5" style={{ background: "#1e1e1e", border: "1px solid #2e2e2e" }}>

      {/* Header da seção */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h2 className="text-sm font-semibold text-white tracking-wide">Dashboard Analytics</h2>
          <span className="text-xs text-gray-600 ml-1">{leads.length} leads</span>
        </div>
        <button onClick={() => setVisible(false)}
          className="text-xs text-gray-600 hover:text-white transition-colors px-2 py-1 rounded-lg"
          style={{ background: "#2a2a2a" }}>
          Ocultar ↑
        </button>
      </div>

      {leads.length === 0 ? (
        <p className="text-center text-sm text-gray-600 py-8">
          Adicione leads para ver os gráficos.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── Gráfico 1: Leads por dia ───────────────────────────────── */}
          <div className="rounded-xl p-4" style={{ background: "#232323", border: "1px solid #2e2e2e" }}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              📈 Leads por dia — últimos 14 dias
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dataByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#e63946" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#e63946" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="leads"
                  stroke="#e63946" strokeWidth={2}
                  fill="url(#gradRed)"
                  dot={{ fill: "#e63946", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#e63946" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Gráfico 2: Por etapa ───────────────────────────────────── */}
          <div className="rounded-xl p-4" style={{ background: "#232323", border: "1px solid #2e2e2e" }}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              📊 Distribuição por etapa
            </h3>
            {dataByStage.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dataByStage} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="stage" tick={{ fill: "#999", fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip
                    formatter={(v) => [`${v} leads`, "Total"]}
                    contentStyle={{ background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {dataByStage.map((entry) => (
                      <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? "#555"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Gráfico 3: Origem (Rosca) ─────────────────────────────── */}
          <div className="rounded-xl p-4" style={{ background: "#232323", border: "1px solid #2e2e2e" }}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              🔵 Origem dos leads
            </h3>
            {dataBySource.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={dataBySource}
                    cx="45%" cy="50%"
                    innerRadius={45} outerRadius={75}
                    dataKey="value"
                    labelLine={false}
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      (percent ?? 0) > 0.05 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""
                    }
                  >
                    {dataBySource.map((_, i) => (
                      <Cell key={i} fill={SOURCE_PALETTE[i % SOURCE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [`${v} leads`, name as string]}
                    contentStyle={{ background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend
                    iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#888", paddingLeft: 8 }}
                    formatter={(value) => <span style={{ color: "#aaa" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Painel 4: Qualificação 🔥⚡❄️ ────────────────────────── */}
          <div className="rounded-xl p-4" style={{ background: "#232323", border: "1px solid #2e2e2e" }}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              🌡️ Temperatura da base
            </h3>
            <div className="grid grid-cols-2 gap-3 h-[148px] content-center">

              {/* Quente */}
              <div className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: "rgba(230,57,70,0.1)", border: "1px solid rgba(230,57,70,0.3)" }}>
                <span className="text-lg leading-none">🔥</span>
                <span className="text-2xl font-bold text-white leading-none">{qualCount.quente}</span>
                <span className="text-xs font-semibold" style={{ color: "#e63946" }}>Quente</span>
                <span className="text-[10px] text-gray-600">
                  {leads.length ? `${((qualCount.quente / leads.length) * 100).toFixed(0)}% do total` : "—"}
                </span>
              </div>

              {/* Morno */}
              <div className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                <span className="text-lg leading-none">⚡</span>
                <span className="text-2xl font-bold text-white leading-none">{qualCount.morno}</span>
                <span className="text-xs font-semibold text-yellow-400">Morno</span>
                <span className="text-[10px] text-gray-600">
                  {leads.length ? `${((qualCount.morno / leads.length) * 100).toFixed(0)}% do total` : "—"}
                </span>
              </div>

              {/* Frio */}
              <div className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <span className="text-lg leading-none">❄️</span>
                <span className="text-2xl font-bold text-white leading-none">{qualCount.frio}</span>
                <span className="text-xs font-semibold text-blue-400">Frio</span>
                <span className="text-[10px] text-gray-600">
                  {leads.length ? `${((qualCount.frio / leads.length) * 100).toFixed(0)}% do total` : "—"}
                </span>
              </div>

              {/* Sem qualificação */}
              <div className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.15)" }}>
                <span className="text-lg leading-none">⬜</span>
                <span className="text-2xl font-bold text-white leading-none">{qualCount.sem}</span>
                <span className="text-xs font-semibold text-gray-500">Sem tag</span>
                <span className="text-[10px] text-gray-600">não qualificados</span>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
