"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Lead = { id: string; status: string; created_at: string; origin?: string; seller?: string; };
type Vehicle = { id: string; status: string; brand?: string; price?: number; };

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo", contato: "Contato", negociacao: "Negociacao", ganho: "Ganho", perdido: "Perdido",
};
const STATUS_COLORS: Record<string, string> = {
  novo: "#6366f1", contato: "#f59e0b", negociacao: "#3b82f6", ganho: "#10b981", perdido: "#ef4444",
};
const SRC_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899"];

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [range, setRange] = useState<30 | 7 | 90>(30);

  const load = useCallback(async (uid: string, days: number) => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [{ data: l }, { data: v }] = await Promise.all([
      supabase.from("leads").select("id,status,created_at,origin,seller").eq("user_id", uid).gte("created_at", since),
      supabase.from("vehicles").select("id,status,brand,price").eq("user_id", uid),
    ]);
    setLeads(l ?? []);
    setVehicles(v ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const stored = localStorage.getItem("crm_userId");
      if (stored) { load(stored, range); return; }
      const { data } = await supabase.auth.getUser();
      if (data?.user) { localStorage.setItem("crm_userId", data.user.id); load(data.user.id, range); }
    })();
  }, [load, range]);

  const active  = leads.filter(l => !["ganho","perdido"].includes(l.status)).length;
  const hot     = leads.filter(l => l.status === "negociacao").length;
  const won     = leads.filter(l => l.status === "ganho").length;
  const lost    = leads.filter(l => l.status === "perdido").length;
  const today   = leads.filter(l => l.created_at?.startsWith(new Date().toISOString().slice(0,10))).length;
  const conv    = leads.length ? Math.round((won / leads.length) * 100) : 0;
  const inStock = vehicles.filter(v => v.status === "disponivel").length;
  const soldVeh = vehicles.filter(v => v.status === "vendido").length;
  const revenue = vehicles.filter(v => v.status === "vendido").reduce((s, v) => s + (v.price ?? 0), 0);

  const dayMap: Record<string, number> = {};
  leads.forEach(l => { const d = l.created_at?.slice(0,10) ?? ""; dayMap[d] = (dayMap[d] ?? 0) + 1; });
  const areaData = Object.entries(dayMap).sort(([a],[b]) => a.localeCompare(b)).slice(-14).map(([date, count]) => ({ date: date.slice(5), count }));

  const funnelData = Object.entries(STATUS_LABELS).map(([k, name]) => ({
    name, value: leads.filter(l => l.status === k).length, color: STATUS_COLORS[k],
  }));

  const srcMap: Record<string, number> = {};
  leads.forEach(l => { const s = l.origin ?? "Direto"; srcMap[s] = (srcMap[s] ?? 0) + 1; });
  const sourceData = Object.entries(srcMap).map(([name, value]) => ({ name, value }));

  const sellerMap: Record<string, number> = {};
  leads.filter(l => l.status === "ganho").forEach(l => { if (l.seller) sellerMap[l.seller] = (sellerMap[l.seller] ?? 0) + 1; });
  const topSellers = Object.entries(sellerMap).sort(([,a],[,b]) => b - a).slice(0,5);

  const brandMap: Record<string, number> = {};
  vehicles.filter(v => v.status === "disponivel").forEach(v => { if (v.brand) brandMap[v.brand] = (brandMap[v.brand] ?? 0) + 1; });
  const brandData = Object.entries(brandMap).sort(([,a],[,b]) => b - a).slice(0,8).map(([name, value]) => ({ name, value }));

  const kpis = [
    { label: "Leads Ativos",       value: active,                                        sub: `${range} dias`,          color: "#6366f1" },
    { label: "Em Estoque",         value: inStock,                                       sub: "disponiveis",            color: "#f59e0b" },
    { label: "Taxa Conversao",     value: `${conv}%`,                                    sub: `${won} fechados`,        color: "#10b981" },
    { label: "Leads Quentes",      value: hot,                                           sub: "em negociacao",          color: "#ef4444" },
    { label: "Leads Hoje",         value: today,                                         sub: "novos",                  color: "#3b82f6" },
    { label: "Perdidos",           value: lost,                                          sub: `${range} dias`,          color: "#6b7280" },
    { label: "Veiculos Vendidos",  value: soldVeh,                                       sub: "no periodo",             color: "#8b5cf6" },
    { label: "Receita Estimada",   value: `R$ ${revenue.toLocaleString("pt-BR")}`,       sub: "veiculos vendidos",      color: "#ec4899" },
  ];

  return (
    <main className="min-h-screen p-6" style={{ background: "#111111" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Painel</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visao geral do negocio automotivo</p>
        </div>
        <div className="flex gap-2">
          {([7,30,90] as const).map(d => (
            <button key={d} onClick={() => setRange(d)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: range===d ? "#dc2626" : "#2e2e2e", color: range===d ? "#fff" : "#888" }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-2xl p-5 flex flex-col gap-1" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-xs text-gray-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { label: "Disponiveis", count: vehicles.filter(v => v.status==="disponivel").length, color: "#10b981" },
          { label: "Reservados",  count: vehicles.filter(v => v.status==="reservado").length,  color: "#f59e0b" },
          { label: "Vendidos",    count: vehicles.filter(v => v.status==="vendido").length,    color: "#6366f1" },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2 rounded-xl px-4 py-2" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs text-gray-300">{label}</span>
            <span className="text-xs font-bold text-white">{count}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="rounded-2xl p-5" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Leads por Dia</p>
          {areaData.length === 0 ? <p className="text-xs text-gray-500 text-center py-8">Sem dados</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis hide />
                <Tooltip contentStyle={{ background: "#222", border: "none", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#cg)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl p-5" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Funil de Vendas</p>
          {funnelData.every(d => d.value === 0) ? <p className="text-xs text-gray-500 text-center py-8">Sem dados</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={funnelData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} width={80}/>
                <Tooltip contentStyle={{ background: "#222", border: "none", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Origem dos Leads</p>
          {sourceData.length === 0 ? <p className="text-xs text-gray-500 text-center py-8">Sem dados</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {sourceData.map((_, i) => <Cell key={i} fill={SRC_COLORS[i % SRC_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v ?? ""}`, "Leads"] as [string, string]} contentStyle={{ background: "#222", border: "none", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: "10px", color: "#888" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl p-5" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Top Vendedores</p>
          {topSellers.length === 0 ? <p className="text-xs text-gray-500 text-center py-8">Nenhum fechamento</p> : (
            <div className="space-y-3">
              {topSellers.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 w-4">{i+1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-300">{name}</span>
                      <span className="text-xs font-bold text-white">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "#2e2e2e" }}>
                      <div className="h-1.5 rounded-full" style={{ background: "#10b981", width: `${Math.round((count / (topSellers[0][1] || 1)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl p-5" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Estoque por Marca</p>
          {brandData.length === 0 ? <p className="text-xs text-gray-500 text-center py-8">Sem estoque</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={brandData}>
                <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false}/>
                <YAxis hide />
                <Tooltip contentStyle={{ background: "#222", border: "none", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#f59e0b" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </main>
  );
}
