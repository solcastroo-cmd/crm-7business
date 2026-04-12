"use client";

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
type Vehicle = {
  id: string; brand: string; model: string; year: string | null;
  price: number | null; status: "disponivel" | "vendido" | "reservado"; created_at: string;
};

const STAGE_ORDER = ["Novo Lead","Contato Inicial","Interesse","Proposta","Negociação","VENDIDO!"];
const STAGE_COLOR: Record<string, string> = {
  "Novo Lead":"#6b7280","Contato Inicial":"#3b82f6","Interesse":"#8b5cf6",
  "Proposta":"#14b8a6","Negociação":"#f59e0b","VENDIDO!":"#22c55e","Perdido":"#e63946",
};
const SRC_COLORS = ["#e63946","#3b82f6","#22c55e","#f59e0b","#8b5cf6","#14b8a6","#f97316","#ec4899"];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function KPICard({ icon, label, value, sub, color, bg }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string; bg?: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: bg ?? "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>{label}</span>
      </div>
      <p className="text-3xl font-black leading-none" style={{ color: color ?? "#1a1a1a" }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: "#aaa" }}>{sub}</p>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 shadow-lg text-xs" style={{ background: "#1a1a1a", border: "1px solid #333" }}>
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [range,    setRange]    = useState<7 | 30 | 90>(30);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id); });
  }, []);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      fetch(`/api/leads?storeId=${userId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/inventory?storeId=${userId}`).then(r => r.ok ? r.json() : []),
    ]).then(([ls, vs]) => {
      setLeads(Array.isArray(ls) ? ls : []);
      setVehicles(Array.isArray(vs) ? vs : []);
      setLoading(false);
    });
  }, [userId]);

  const kpis = useMemo(() => {
    const total      = leads.length;
    const vendidos   = leads.filter(l => l.stage === "VENDIDO!").length;
    const perdidos   = leads.filter(l => l.stage === "Perdido").length;
    const quentes    = leads.filter(l => l.qualification === "quente").length;
    const hoje       = leads.filter(l => startOfDay(parseISO(l.created_at)).getTime() === startOfDay(new Date()).getTime()).length;
    const taxa       = total > 0 ? ((vendidos / total) * 100).toFixed(1) : "0";
    const ativos     = total - vendidos - perdidos;
    const disponiveis = vehicles.filter(v => v.status === "disponivel").length;
    const reservados  = vehicles.filter(v => v.status === "reservado").length;
    const vendidosEst = vehicles.filter(v => v.status === "vendido").length;
    const totalEst    = vehicles.length;
    const receita     = vehicles.filter(v => v.status === "vendido" && v.price).reduce((acc, v) => acc + (v.price ?? 0), 0);
    return { total, vendidos, perdidos, quentes, hoje, taxa, ativos, disponiveis, reservados, vendidosEst, totalEst, receita };
  }, [leads, vehicles]);

  const leadsChart = useMemo(() => {
    const days: { date: string; Leads: number; Vendidos: number }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d    = subDays(new Date(), i);
      const key  = format(d, "dd/MM", { locale: ptBR });
      const dayStart = startOfDay(d).getTime();
      const dayEnd   = dayStart + 86_400_000;
      const Leads    = leads.filter(l => { const t = parseISO(l.created_at).getTime(); return t >= dayStart && t < dayEnd; }).length;
      const Vendidos = leads.filter(l => l.stage === "VENDIDO!" && (() => { const t = parseISO(l.created_at).getTime(); return t >= dayStart && t < dayEnd; })()).length;
      days.push({ date: key, Leads, Vendidos });
    }
    return days;
  }, [leads, range]);

  const funnelData = useMemo(() =>
    STAGE_ORDER.map(s => ({ name: s, count: leads.filter(l => l.stage === s).length })),
    [leads]
  );

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { map[l.source] = (map[l.source] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [leads]);

  const sellerData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.filter(l => l.stage === "VENDIDO!" && l.seller).forEach(l => { map[l.seller!] = (map[l.seller!] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [leads]);

  const brandData = useMemo(() => {
    const map: Record<string, number> = {};
    vehicles.filter(v => v.status === "disponivel").forEach(v => { map[v.brand] = (map[v.brand] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [vehicles]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f0f2f5" }}>
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Carregando dashboard...</p>
      </div>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "#f0f2f5", padding: "24px" }}>
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">📊 Dashboard</h1>
          <p className="text-sm text-gray-500">Visão geral do CRM de veículos</p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setRange(d)}
              className="text-xs px-4 py-2 rounded-xl font-bold transition-all"
              style={{ background: range === d ? "#e63946" : "#fff", color: range === d ? "#fff" : "#6b7280", border: `1px solid ${range === d ? "#e63946" : "#e5e7eb"}` }}>
              {d}d
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KPICard icon="🏷️" label="Leads Ativos"     value={kpis.ativos}    sub={`Total: ${kpis.total}`} />
        <KPICard icon="🚗" label="Em Estoque"        value={kpis.disponiveis} sub={`${kpis.reservados} reservados`} />
        <KPICard icon="✅" label="Taxa Conversão"    value={`${kpis.taxa}%`} sub={`${kpis.vendidos} vendidos`} color="#22c55e" />
        <KPICard icon="🔥" label="Leads Quentes"     value={kpis.quentes}   color="#ef4444" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KPICard icon="📅" label="Leads Hoje"        value={kpis.hoje} />
        <KPICard icon="❌" label="Perdidos"           value={kpis.perdidos} color="#6b7280" />
        <KPICard icon="🚘" label="Veículos Vendidos"  value={kpis.vendidosEst} sub={`de ${kpis.totalEst} total`} color="#3b82f6" />
        <KPICard icon="💰" label="Receita Estimada"   value={kpis.receita > 0 ? fmtBRL(kpis.receita) : "—"} color="#22c55e" />
      </div>

      <div className="rounded-2xl p-5 mb-5" style={{ background: "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <h2 className="font-bold text-gray-900 mb-4 text-sm">📈 Leads nos últimos {range} dias</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={leadsChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e63946" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#e63946" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gVendidos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} interval={range > 14 ? Math.floor(range / 7) : 0} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Area type="monotone" dataKey="Leads"    stroke="#e63946" fill="url(#gLeads)"    strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Vendidos" stroke="#22c55e" fill="url(#gVendidos)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">🚦 Funil de Vendas</h2>
          {funnelData.map(({ name, count }) => {
            const maxVal = Math.max(...funnelData.map(s => s.count), 1);
            const pct    = (count / maxVal) * 100;
            return (
              <div key={name} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 font-medium truncate" style={{ maxWidth: "140px" }}>{name}</span>
                  <span className="text-xs font-bold text-gray-900">{count}</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "#f3f4f6" }}>
                  <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: STAGE_COLOR[name] ?? "#e63946" }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">📡 Origem dos Leads</h2>
          {sourceData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {sourceData.map((_, i) => <Cell key={i} fill={SRC_COLORS[i % SRC_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v ?? ""}`, "Leads"] as [string, string]} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">🏆 Top Vendedores</h2>
          {sellerData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Sem vendas registradas</p>
          ) : (
            <div className="space-y-3">
              {sellerData.slice(0, 6).map(({ name, value }, i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                    style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#6b7280" : i === 2 ? "#b45309" : "#e5e7eb", color: i < 3 ? "#fff" : "#6b7280" }}>
                    {i + 1}
                  </span>
                  <span className="flex-1 text-xs font-medium text-gray-700 truncate">{name}</span>
                  <span className="text-xs font-bold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {brandData.length > 0 && (
        <div className="rounded-2xl p-5 mb-5" style={{ background: "#fff", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">🚗 Marcas no Estoque (Disponíveis)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={brandData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Veículos" radius={[4, 4, 0, 0]}>
                {brandData.map((_, i) => <Cell key={i} fill={SRC_COLORS[i % SRC_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Disponíveis", value: kpis.disponiveis, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
          { label: "Reservados",  value: kpis.reservados,  color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
          { label: "Vendidos",    value: kpis.vendidosEst, color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className="rounded-2xl p-5 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
            <p className="text-3xl font-black" style={{ color }}>{value}</p>
            <p className="text-xs font-semibold mt-1" style={{ color }}>{label}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
