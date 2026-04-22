"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useUserId } from "@/hooks/useUserId";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ─────────────────────────────────────────────────────────────────────
type Lead = {
  id: string; name: string | null; phone: string; stage: string;
  source: string | null; seller: string | null; qualification: string | null;
  budget: number | null; created_at: string; updated_at: string;
};
type Vehicle = {
  id: string; brand: string | null; model: string | null; year: number | null;
  price: number | null; status: string; created_at: string; updated_at: string;
};

const STAGES = ["Novo Lead","Contato Inicial","Interesse","Proposta","Negociação","VENDIDO!","Perdido"];
const STAGE_COLORS: Record<string,string> = {
  "Novo Lead":"#6366f1","Contato Inicial":"#3b82f6","Interesse":"#8b5cf6",
  "Proposta":"#14b8a6","Negociação":"#f59e0b","VENDIDO!":"#22c55e","Perdido":"#6b7280",
};
const PIE_COLORS = ["#ef4444","#f59e0b","#3b82f6","#6b7280"];
const TABS = ["Visão Geral","Funil","Vendas","Vendedores","Leads","Veículos","Origens","Relatório"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => b === 0 ? "—" : `${Math.round((a / b) * 100)}%`;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function diffDays(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

// ── Sub-components ────────────────────────────────────────────────────────────
const S = {
  card: {
    background: "#232323", border: "1px solid #2a2a2a",
    borderRadius: "14px", padding: "20px 24px",
  } as React.CSSProperties,
  label: { color: "#6b7280", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } as React.CSSProperties,
  value: { color: "#fff", fontSize: "28px", fontWeight: 800, margin: "6px 0 0" } as React.CSSProperties,
  sub:   { color: "#555", fontSize: "12px", marginTop: "4px" } as React.CSSProperties,
  th:    { color: "#555", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, padding: "10px 14px", textAlign: "left" as const },
  td:    { color: "#d1d5db", fontSize: "13px", padding: "12px 14px", borderBottom: "1px solid #222" },
};

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ ...S.card, borderColor: accent ? "#e63946" : "#2a2a2a" }}>
      <p style={S.label}>{label}</p>
      <p style={{ ...S.value, color: accent ? "#e63946" : "#fff" }}>{value}</p>
      {sub && <p style={S.sub}>{sub}</p>}
    </div>
  );
}

// ── ABA 1: Visão Geral ────────────────────────────────────────────────────────
function TabVisaoGeral({ leads }: { leads: Lead[] }) {
  const [range, setRange] = useState<7|30|90>(30);
  const since = daysAgo(range);
  const filtered = leads.filter(l => l.created_at >= since);
  const vendidos = filtered.filter(l => l.stage === "VENDIDO!");
  const propostas = filtered.filter(l => l.stage === "Proposta" || l.stage === "Negociação");
  const budgets = vendidos.map(l => l.budget ?? 0).filter(b => b > 0);
  const faturamento = budgets.reduce((s, b) => s + b, 0);
  const ticket = budgets.length ? Math.round(faturamento / budgets.length) : 0;

  // Leads por dia
  const dayMap: Record<string, number> = {};
  filtered.forEach(l => { const d = l.created_at.slice(0,10); dayMap[d] = (dayMap[d]??0)+1; });
  const areaData = Object.entries(dayMap).sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({ date: date.slice(5), count }));

  return (
    <div>
      {/* Range filter */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {([7,30,90] as const).map(d => (
          <button key={d} onClick={() => setRange(d)} style={{
            padding: "6px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px",
            background: range===d ? "#e63946" : "#232323", color: range===d ? "#fff" : "#6b7280",
          }}>{d} dias</button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "16px", marginBottom: "28px" }}>
        <KpiCard label="Total Leads"    value={String(filtered.length)} sub={`últimos ${range} dias`} />
        <KpiCard label="Em Proposta"    value={String(propostas.length)} />
        <KpiCard label="Vendas"         value={String(vendidos.length)} accent />
        <KpiCard label="Ticket Médio"   value={ticket ? brl(ticket) : "—"} />
        <KpiCard label="Faturamento"    value={faturamento ? brl(faturamento) : "—"} accent />
      </div>

      {/* Gráfico */}
      <div style={{ ...S.card, padding: "24px" }}>
        <p style={{ ...S.label, marginBottom: "16px" }}>Leads por dia</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={areaData}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e63946" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#e63946" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 11 }} />
            <YAxis tick={{ fill: "#555", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #333", color: "#fff" }} />
            <Area type="monotone" dataKey="count" stroke="#e63946" fill="url(#grad)" name="Leads" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── ABA 2: Funil ─────────────────────────────────────────────────────────────
function TabFunil({ leads }: { leads: Lead[] }) {
  const counts = STAGES.map(s => ({ stage: s, count: leads.filter(l => l.stage === s).length }));
  const total = leads.length;

  // Maior gargalo
  let maxDrop = 0; let gargaloA = ""; let gargaloB = ""; let gargaloN = 0;
  for (let i = 0; i < counts.length - 1; i++) {
    const a = counts[i].count; const b = counts[i+1].count;
    const drop = a - b;
    if (a > 0 && drop > maxDrop) { maxDrop = drop; gargaloA = counts[i].stage; gargaloB = counts[i+1].stage; gargaloN = drop; }
  }

  return (
    <div>
      {gargaloA && (
        <div style={{ background: "#2a1510", border: "1px solid #e63946", borderRadius: "12px", padding: "14px 20px", marginBottom: "24px" }}>
          <p style={{ color: "#fca5a5", fontSize: "14px", margin: 0 }}>
            ⚠️ <strong>Maior gargalo:</strong> {gargaloN} leads perdidos entre <strong>{gargaloA}</strong> → <strong>{gargaloB}</strong>
          </p>
        </div>
      )}

      <div style={{ ...S.card, padding: "24px", marginBottom: "24px" }}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart layout="vertical" data={counts} margin={{ left: 20 }}>
            <XAxis type="number" tick={{ fill: "#555", fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fill: "#9ca3af", fontSize: 12 }} width={130} />
            <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #333", color: "#fff" }} />
            <Bar dataKey="count" name="Leads" radius={[0,4,4,0]}>
              {counts.map((c) => <Cell key={c.stage} fill={STAGE_COLORS[c.stage] ?? "#6b7280"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...S.card }}>
        <p style={{ ...S.label, marginBottom: "12px" }}>Taxas de conversão entre etapas</p>
        {STAGES.slice(0,-1).map((s,i) => {
          const a = counts[i].count; const b = counts[i+1].count;
          const p = a > 0 ? Math.round((b/a)*100) : 0;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid #222" }}>
              <span style={{ color: "#9ca3af", fontSize: "13px", flex: 1 }}>{s} → {STAGES[i+1]}</span>
              <div style={{ width: "120px", background: "#111", borderRadius: "4px", height: "6px" }}>
                <div style={{ width: `${p}%`, background: p > 50 ? "#22c55e" : p > 25 ? "#f59e0b" : "#ef4444", height: "100%", borderRadius: "4px" }} />
              </div>
              <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700, width: "40px", textAlign: "right" }}>{p}%</span>
            </div>
          );
        })}
        <p style={{ color: "#555", fontSize: "12px", marginTop: "12px" }}>Total de leads: {total}</p>
      </div>
    </div>
  );
}

// ── ABA 3: Vendas ─────────────────────────────────────────────────────────────
function TabVendas({ leads }: { leads: Lead[] }) {
  const vendidos = leads.filter(l => l.stage === "VENDIDO!");
  const budgets = vendidos.map(l => l.budget ?? 0).filter(b => b > 0);
  const faturamento = budgets.reduce((s,b)=>s+b,0);
  const ticket = budgets.length ? Math.round(faturamento/budgets.length) : 0;

  // Por mês (últimos 6 meses)
  const monthMap: Record<string,{ count:number; fat:number }> = {};
  vendidos.forEach(l => {
    const m = monthKey(l.updated_at);
    if (!monthMap[m]) monthMap[m] = { count:0, fat:0 };
    monthMap[m].count++;
    monthMap[m].fat += l.budget ?? 0;
  });
  const monthData = Object.entries(monthMap).sort(([a],[b])=>a.localeCompare(b)).slice(-6)
    .map(([month,v]) => ({ month: month.slice(5), vendas: v.count, faturamento: v.fat }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "16px", marginBottom: "28px" }}>
        <KpiCard label="Faturamento Total" value={faturamento ? brl(faturamento) : "—"} accent />
        <KpiCard label="Ticket Médio"      value={ticket ? brl(ticket) : "—"} />
        <KpiCard label="Total Vendidos"    value={String(vendidos.length)} />
      </div>

      <div style={{ ...S.card, padding: "24px", marginBottom: "24px" }}>
        <p style={{ ...S.label, marginBottom: "16px" }}>Vendas por mês (últimos 6 meses)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthData}>
            <XAxis dataKey="month" tick={{ fill: "#555", fontSize: 11 }} />
            <YAxis tick={{ fill: "#555", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #333", color: "#fff" }} />
            <Bar dataKey="vendas" fill="#e63946" name="Vendas" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...S.card, padding: "24px" }}>
        <p style={{ ...S.label, marginBottom: "16px" }}>Faturamento por mês</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthData}>
            <XAxis dataKey="month" tick={{ fill: "#555", fontSize: 11 }} />
            <YAxis tick={{ fill: "#555", fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #333", color: "#fff" }} formatter={(v: unknown) => brl(Number(v))} />
            <Bar dataKey="faturamento" fill="#22c55e" name="Faturamento" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── ABA 4: Vendedores ─────────────────────────────────────────────────────────
function TabVendedores({ leads }: { leads: Lead[] }) {
  const map: Record<string,{ atendidos:number; vendas:number; fat:number }> = {};
  leads.forEach(l => {
    const s = l.seller || "Sem vendedor";
    if (!map[s]) map[s] = { atendidos:0, vendas:0, fat:0 };
    map[s].atendidos++;
    if (l.stage === "VENDIDO!") { map[s].vendas++; map[s].fat += l.budget ?? 0; }
  });
  const rows = Object.entries(map).sort((a,b)=>b[1].vendas-a[1].vendas);

  return (
    <div style={S.card}>
      <p style={{ ...S.label, marginBottom: "16px" }}>Ranking de Vendedores</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333" }}>
              {["#","Vendedor","Leads","Vendas","Conversão","Faturamento"].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name,v],i) => (
              <tr key={name} style={{ background: i===0 ? "rgba(230,57,70,0.05)" : "transparent" }}>
                <td style={{ ...S.td, color: i===0?"#e63946":"#555", fontWeight:700 }}>#{i+1}</td>
                <td style={{ ...S.td, color:"#fff", fontWeight:600 }}>{name}</td>
                <td style={S.td}>{v.atendidos}</td>
                <td style={{ ...S.td, color:"#22c55e", fontWeight:700 }}>{v.vendas}</td>
                <td style={S.td}>{pct(v.vendas, v.atendidos)}</td>
                <td style={{ ...S.td, color:"#fff" }}>{v.fat ? brl(v.fat) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ ...S.td, textAlign:"center", color:"#555" }}>Sem dados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ABA 5: Leads ──────────────────────────────────────────────────────────────
function TabLeads({ leads }: { leads: Lead[] }) {
  const quente = leads.filter(l=>l.qualification==="quente").length;
  const morno  = leads.filter(l=>l.qualification==="morno").length;
  const frio   = leads.filter(l=>l.qualification==="frio").length;
  const semQ   = leads.filter(l=>!l.qualification).length;

  const pieData = [
    { name:"Quente", value:quente, color:"#ef4444" },
    { name:"Morno",  value:morno,  color:"#f59e0b" },
    { name:"Frio",   value:frio,   color:"#3b82f6" },
    { name:"Sem qual.",value:semQ, color:"#6b7280" },
  ].filter(d=>d.value>0);

  // Tempo médio de resposta (leads que saíram de Novo Lead)
  const movidos = leads.filter(l=>l.stage!=="Novo Lead");
  const tempos = movidos.map(l=>diffDays(l.created_at, l.updated_at)).filter(d=>d>0&&d<180);
  const tmedio = tempos.length ? (tempos.reduce((s,d)=>s+d,0)/tempos.length).toFixed(1) : "—";

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:"16px", marginBottom:"28px" }}>
        <KpiCard label="Total"       value={String(leads.length)} />
        <KpiCard label="🔥 Quentes" value={String(quente)} accent />
        <KpiCard label="🌡 Mornos"  value={String(morno)} />
        <KpiCard label="🧊 Frios"   value={String(frio)} />
        <KpiCard label="Sem Qual."  value={String(semQ)} />
        <KpiCard label="Tempo Médio Resposta" value={tmedio === "—" ? "—" : `${tmedio} dias`} sub="desde criação até 1ª movimentação" />
      </div>

      <div style={{ ...S.card, padding:"24px" }}>
        <p style={{ ...S.label, marginBottom:"16px" }}>Distribuição por qualificação</p>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({name,percent})=>`${name} ${((percent??0)*100).toFixed(0)}%`} labelLine={false}>
              {pieData.map(d=><Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background:"#1e1e1e", border:"1px solid #333", color:"#fff" }} />
            <Legend wrapperStyle={{ color:"#9ca3af" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── ABA 6: Veículos ───────────────────────────────────────────────────────────
function TabVeiculos({ vehicles }: { vehicles: Vehicle[] }) {
  const emEstoque = vehicles.filter(v=>v.status==="disponivel");
  const vendidos  = vehicles.filter(v=>v.status==="vendido");

  const brandMap: Record<string,number> = {};
  emEstoque.forEach(v => { const b = v.brand||"Sem marca"; brandMap[b] = (brandMap[b]??0)+1; });
  const brandRows = Object.entries(brandMap).sort((a,b)=>b[1]-a[1]).slice(0,10);

  const tempos = vendidos.map(v=>diffDays(v.created_at,v.updated_at)).filter(d=>d>0&&d<1000);
  const tmedio = tempos.length ? (tempos.reduce((s,d)=>s+d,0)/tempos.length).toFixed(0) : "—";

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:"16px", marginBottom:"28px" }}>
        <KpiCard label="Em Estoque" value={String(emEstoque.length)} />
        <KpiCard label="Vendidos"   value={String(vendidos.length)} accent />
        <KpiCard label="Total"      value={String(vehicles.length)} />
        <KpiCard label="Tempo Médio em Estoque" value={tmedio==="—"?"—":`${tmedio} dias`} sub="até venda" />
      </div>

      <div style={S.card}>
        <p style={{ ...S.label, marginBottom:"12px" }}>Top 10 marcas em estoque</p>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ borderBottom:"1px solid #333" }}>
            <th style={S.th}>Marca</th><th style={S.th}>Qtd</th>
          </tr></thead>
          <tbody>
            {brandRows.map(([brand,count],i)=>(
              <tr key={brand}>
                <td style={{ ...S.td, color:"#fff" }}>
                  {i===0&&<span style={{ color:"#f59e0b", marginRight:"6px" }}>★</span>}{brand}
                </td>
                <td style={S.td}>{count}</td>
              </tr>
            ))}
            {brandRows.length===0&&<tr><td colSpan={2} style={{ ...S.td, textAlign:"center", color:"#555" }}>Sem dados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ABA 7: Origens ────────────────────────────────────────────────────────────
function TabOrigens({ leads }: { leads: Lead[] }) {
  const map: Record<string,{ total:number; convertidos:number }> = {};
  leads.forEach(l => {
    const s = l.source || "Direto";
    if (!map[s]) map[s] = { total:0, convertidos:0 };
    map[s].total++;
    if (l.stage==="VENDIDO!") map[s].convertidos++;
  });
  const rows = Object.entries(map).sort((a,b)=>b[1].total-a[1].total);
  const barData = rows.map(([name,v])=>({ name, total:v.total, convertidos:v.convertidos }));

  return (
    <div>
      <div style={{ ...S.card, padding:"24px", marginBottom:"24px" }}>
        <p style={{ ...S.label, marginBottom:"16px" }}>Leads e conversões por canal</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart layout="vertical" data={barData} margin={{ left:20 }}>
            <XAxis type="number" tick={{ fill:"#555", fontSize:11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill:"#9ca3af", fontSize:12 }} width={110} />
            <Tooltip contentStyle={{ background:"#1e1e1e", border:"1px solid #333", color:"#fff" }} />
            <Legend wrapperStyle={{ color:"#9ca3af" }} />
            <Bar dataKey="total"      name="Total"      fill="#6366f1" radius={[0,4,4,0]} />
            <Bar dataKey="convertidos" name="Convertidos" fill="#22c55e" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={S.card}>
        <p style={{ ...S.label, marginBottom:"12px" }}>Detalhamento por origem</p>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ borderBottom:"1px solid #333" }}>
            {["Origem","Total","Convertidos","Taxa"].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(([name,v])=>(
              <tr key={name}>
                <td style={{ ...S.td, color:"#fff", fontWeight:600 }}>{name}</td>
                <td style={S.td}>{v.total}</td>
                <td style={{ ...S.td, color:"#22c55e" }}>{v.convertidos}</td>
                <td style={{ ...S.td, fontWeight:700, color: parseFloat(pct(v.convertidos,v.total))>20?"#22c55e":"#9ca3af" }}>
                  {pct(v.convertidos,v.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ABA 8: Relatório PDF ──────────────────────────────────────────────────────
function TabRelatorio({ leads, vehicles }: { leads: Lead[]; vehicles: Vehicle[] }) {
  const now = new Date();
  const mesAtual    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const mesAnterior = (() => { const d=new Date(now); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();

  const leadsDoMes  = leads.filter(l=>monthKey(l.created_at)===mesAtual);
  const leadsAntes  = leads.filter(l=>monthKey(l.created_at)===mesAnterior);
  const vendidosMes = leadsDoMes.filter(l=>l.stage==="VENDIDO!");
  const fat         = vendidosMes.map(l=>l.budget??0).filter(b=>b>0).reduce((s,b)=>s+b,0);
  const ticket      = vendidosMes.length && fat ? Math.round(fat/vendidosMes.length) : 0;
  const emEstoque   = vehicles.filter(v=>v.status==="disponivel").length;
  const emProposta  = leadsDoMes.filter(l=>l.stage==="Proposta"||l.stage==="Negociação").length;

  // Gargalo
  const stageCounts = STAGES.map(s=>({ stage:s, count:leads.filter(l=>l.stage===s).length }));
  let gargalo=""; let gargaloN=0;
  for(let i=0;i<stageCounts.length-1;i++){
    const drop=stageCounts[i].count-stageCounts[i+1].count;
    if(drop>gargaloN){ gargaloN=drop; gargalo=`${stageCounts[i].stage} → ${stageCounts[i+1].stage}`; }
  }

  // Vendedor destaque
  const sellerMap: Record<string,number> = {};
  vendidosMes.forEach(l=>{ if(l.seller) sellerMap[l.seller]=(sellerMap[l.seller]??0)+1; });
  const topSeller = Object.entries(sellerMap).sort((a,b)=>b[1]-a[1])[0];

  // Melhor canal
  const canalMap: Record<string,{ total:number; conv:number }> = {};
  leads.forEach(l=>{ const s=l.source||"Direto"; if(!canalMap[s])canalMap[s]={total:0,conv:0}; canalMap[s].total++; if(l.stage==="VENDIDO!")canalMap[s].conv++; });
  const topCanal = Object.entries(canalMap).filter(([,v])=>v.total>=3).sort((a,b)=>(b[1].conv/b[1].total)-(a[1].conv/a[1].total))[0];

  const insights = [
    `Leads este mes: ${leadsDoMes.length} ${leadsDoMes.length>=leadsAntes.length?`(+${leadsDoMes.length-leadsAntes.length} vs mes anterior)`:`(-${leadsAntes.length-leadsDoMes.length} vs mes anterior)`}`,
    gargalo ? `Maior gargalo do funil: ${gargaloN} leads perdidos em ${gargalo}` : "Funil sem gargalos criticos identificados",
    topSeller ? `Vendedor destaque: ${topSeller[0]} com ${topSeller[1]} venda(s) no mes` : "Nenhuma venda registrada com vendedor no mes",
    topCanal ? `Canal com melhor conversao: ${topCanal[0]} (${Math.round((topCanal[1].conv/topCanal[1].total)*100)}% de taxa)` : "Dados de canal insuficientes para analise",
  ];

  const kpis = [
    { l:"Leads no Mes",    v:String(leadsDoMes.length) },
    { l:"Vendas",          v:String(vendidosMes.length) },
    { l:"Faturamento",     v:fat?brl(fat):"—" },
    { l:"Ticket Medio",    v:ticket?brl(ticket):"—" },
    { l:"Em Estoque",      v:String(emEstoque) },
    { l:"Em Proposta",     v:String(emProposta) },
  ];

  // Funil para o relatório
  const funnelRows = stageCounts.map(({stage,count})=>({ stage, count, pct: leads.length?Math.round((count/leads.length)*100):0 }));

  // Gera HTML em nova janela e imprime
  function handlePrint() {
    const mesLabel = now.toLocaleDateString("pt-BR",{ month:"long", year:"numeric" });
    const dataLabel = now.toLocaleDateString("pt-BR");

    const kpisHTML = kpis.map(({l,v})=>`
      <div style="background:#f8f8f8;border:1px solid #ddd;border-radius:8px;padding:14px 18px;">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">${l}</div>
        <div style="font-size:22px;font-weight:800;color:#1a1a1a;margin-top:4px;">${v}</div>
      </div>`).join("");

    const insightsHTML = insights.map((ins,i)=>`
      <div style="border-left:4px solid #e63946;padding:12px 16px;background:#fff8f8;border-radius:0 8px 8px 0;margin-bottom:10px;">
        <span style="font-size:13px;color:#333;line-height:1.6;">${i+1}. ${ins}</span>
      </div>`).join("");

    const funnelHTML = funnelRows.map(({stage,count,pct})=>`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333;">${stage}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;font-weight:700;text-align:center;">${count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:center;color:#666;">${pct}%</td>
      </tr>`).join("");

    const vendedoresMap: Record<string,{atendidos:number;vendas:number}> = {};
    leads.forEach(l=>{ const s=l.seller||"Sem vendedor"; if(!vendedoresMap[s])vendedoresMap[s]={atendidos:0,vendas:0}; vendedoresMap[s].atendidos++; if(l.stage==="VENDIDO!")vendedoresMap[s].vendas++; });
    const vendedoresHTML = Object.entries(vendedoresMap).sort((a,b)=>b[1].vendas-a[1].vendas).slice(0,5).map(([name,v],i)=>`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${i+1}. ${name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${v.atendidos}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;font-weight:700;text-align:center;color:#16a34a;">${v.vendas}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${v.atendidos>0?Math.round((v.vendas/v.atendidos)*100):0}%</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Relatorio Mensal CRM 7Business — ${mesLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; }
    h1 { font-size: 24px; font-weight: 800; color: #1a1a1a; }
    h2 { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 28px 0 12px; border-bottom: 2px solid #e63946; padding-bottom: 6px; }
    .header { text-align: center; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid #eee; }
    .badge { display: inline-block; width: 56px; height: 56px; background: #e63946; border-radius: 14px; font-size: 26px; font-weight: 900; color: #fff; line-height: 56px; text-align: center; margin-bottom: 12px; }
    .kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f0f0f0; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="badge">7</div>
    <h1>Relatorio Mensal — CRM 7Business</h1>
    <p style="color:#888;font-size:14px;margin-top:6px;">${mesLabel} &nbsp;·&nbsp; Gerado em ${dataLabel}</p>
  </div>

  <h2>Resumo do Mes</h2>
  <div class="kpis">${kpisHTML}</div>

  <h2>Insights Automaticos</h2>
  ${insightsHTML}

  <h2>Funil de Conversao</h2>
  <table>
    <thead><tr><th>Etapa</th><th style="text-align:center">Leads</th><th style="text-align:center">% do Total</th></tr></thead>
    <tbody>${funnelHTML}</tbody>
  </table>

  <h2>Ranking de Vendedores</h2>
  <table>
    <thead><tr><th>Vendedor</th><th style="text-align:center">Leads</th><th style="text-align:center">Vendas</th><th style="text-align:center">Conversao</th></tr></thead>
    <tbody>${vendedoresHTML}</tbody>
  </table>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { alert("Permita pop-ups para gerar o relatório."); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); };
  }

  // Preview na tela
  return (
    <div>
      <button onClick={handlePrint} style={{
        background:"#e63946", color:"#fff", border:"none", borderRadius:"10px",
        padding:"12px 28px", fontWeight:700, fontSize:"15px", cursor:"pointer",
        marginBottom:"28px", display:"flex", alignItems:"center", gap:"8px",
      }}>
        🖨️ Gerar Relatório do Mês (PDF)
      </button>

      {/* Preview */}
      <div style={{ ...S.card, padding:"32px", maxWidth:"720px" }}>
        <div style={{ textAlign:"center", marginBottom:"24px", borderBottom:"1px solid #333", paddingBottom:"20px" }}>
          <div style={{ width:"48px", height:"48px", background:"#e63946", borderRadius:"12px", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:"22px", fontWeight:900, color:"#fff", marginBottom:"12px" }}>7</div>
          <h2 style={{ color:"#fff", fontSize:"20px", fontWeight:800 }}>Relatório Mensal — {now.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</h2>
          <p style={{ color:"#555", fontSize:"13px", marginTop:"4px" }}>Gerado em {now.toLocaleDateString("pt-BR")}</p>
        </div>

        <p style={{ ...S.label, marginBottom:"12px" }}>Resumo do mês</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px", marginBottom:"24px" }}>
          {kpis.map(({l,v})=>(
            <div key={l} style={{ background:"#1e1e1e", borderRadius:"8px", padding:"12px" }}>
              <p style={S.label}>{l}</p>
              <p style={{ color:"#fff", fontSize:"18px", fontWeight:800, marginTop:"4px" }}>{v}</p>
            </div>
          ))}
        </div>

        <p style={{ ...S.label, marginBottom:"12px" }}>Insights automáticos</p>
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {insights.map((ins,i)=>(
            <div key={i} style={{ borderLeft:"3px solid #e63946", paddingLeft:"14px", paddingTop:"6px", paddingBottom:"6px" }}>
              <p style={{ color:"#d1d5db", fontSize:"13px", lineHeight:"1.6", margin:0 }}>{i+1}. {ins}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function GestaoPage() {
  const { userId, loading: userLoading } = useUserId();
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      supabase.from("leads").select("id,name,phone,stage,source,seller,qualification,budget,created_at,updated_at").eq("store_id", userId),
      supabase.from("vehicles").select("id,brand,model,year,price,status,created_at,updated_at").eq("store_id", userId),
    ]).then(([{ data: l }, { data: v }]) => {
      setLeads((l as Lead[]) ?? []);
      setVehicles((v as Vehicle[]) ?? []);
      setLoading(false);
    });
  }, [userId]);

  if (userLoading || loading) return (
    <div style={{ minHeight:"100vh", background:"#1a1a1a", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"#555", fontSize:"14px" }}>Carregando Gestão...</p>
    </div>
  );

  return (
    <main style={{ minHeight:"100vh", background:"#1a1a1a", padding:"28px 24px", fontFamily:"Segoe UI,sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom:"28px" }}>
        <h1 style={{ color:"#fff", fontSize:"22px", fontWeight:800, margin:0 }}>📈 Gestão</h1>
        <p style={{ color:"#6b7280", fontSize:"13px", marginTop:"4px" }}>
          {leads.length} leads · {vehicles.length} veículos
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:"4px", marginBottom:"28px", overflowX:"auto", paddingBottom:"4px" }}>
        {TABS.map((tab,i) => (
          <button key={tab} onClick={() => setActiveTab(i)} style={{
            padding:"8px 16px", borderRadius:"8px", border:"none", cursor:"pointer",
            fontWeight:600, fontSize:"13px", whiteSpace:"nowrap",
            background: activeTab===i ? "#e63946" : "#232323",
            color:      activeTab===i ? "#fff"    : "#6b7280",
            transition:"all 0.15s",
          }}>{tab}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab===0 && <TabVisaoGeral  leads={leads} />}
      {activeTab===1 && <TabFunil       leads={leads} />}
      {activeTab===2 && <TabVendas      leads={leads} />}
      {activeTab===3 && <TabVendedores  leads={leads} />}
      {activeTab===4 && <TabLeads       leads={leads} />}
      {activeTab===5 && <TabVeiculos    vehicles={vehicles} />}
      {activeTab===6 && <TabOrigens     leads={leads} />}
      {activeTab===7 && <TabRelatorio   leads={leads} vehicles={vehicles} />}
    </main>
  );
}
