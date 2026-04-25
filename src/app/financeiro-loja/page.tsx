"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/* ── Types ─────────────────────────────────────────────────────────── */
type Expense = {
  id: string;
  store_id?: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  payment_method: string;
  status: "pago" | "pendente";
  receipt_url?: string;
  notes?: string;
  created_at: string;
};

type VehicleExpense = {
  id: string; vehicle_id: string; date: string;
  category: string; description?: string; amount: number;
};

type Sale = {
  id: string; total_value: number; closing_date: string;
  status: string; payment_method: string; buyer_name: string;
};

/* ── Constants ─────────────────────────────────────────────────────── */
const CATEGORIES = [
  "Aluguel", "Água/Luz/Internet", "Salários", "Benefícios (VT/VR)",
  "Marketing — OLX", "Marketing — Webmotors", "Marketing — iCarros",
  "CRM/Software", "Taxas Bancárias", "Contabilidade",
  "Combustível Operacional", "Outros",
];

const PAYMENT_METHODS = [
  { value: "pix",           label: "PIX" },
  { value: "boleto",        label: "Boleto" },
  { value: "cartao",        label: "Cartão" },
  { value: "debito",        label: "Débito" },
  { value: "dinheiro",      label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
];

const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map(p => [p.value, p.label]),
);

const CAT_COLORS: Record<string, string> = {
  "Aluguel":                  "#e63946",
  "Água/Luz/Internet":        "#3b82f6",
  "Salários":                 "#8b5cf6",
  "Benefícios (VT/VR)":      "#06b6d4",
  "Marketing — OLX":         "#f59e0b",
  "Marketing — Webmotors":   "#f97316",
  "Marketing — iCarros":     "#eab308",
  "CRM/Software":             "#10b981",
  "Taxas Bancárias":         "#6b7280",
  "Contabilidade":            "#ec4899",
  "Combustível Operacional": "#14b8a6",
  "Outros":                   "#9ca3af",
};

const EMPTY_FORM = {
  date: new Date().toISOString().split("T")[0],
  description: "", category: CATEGORIES[0],
  amount: "", payment_method: "pix",
  status: "pago" as "pago" | "pendente",
  notes: "",
};

/* ── Helpers ────────────────────────────────────────────────────────── */
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
}

/* ── Mini bar chart ─────────────────────────────────────────────────── */
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-[10px] w-32 shrink-0 truncate" style={{ color: "#9ca3af" }}>{d.label}</span>
          <div className="flex-1 rounded-full h-4 overflow-hidden" style={{ background: "#1f2937" }}>
            <div className="h-4 rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <span className="text-[10px] w-20 text-right shrink-0 font-semibold text-white">{brl(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── PDF Report ─────────────────────────────────────────────────────── */
function printReport(
  expenses: Expense[],
  storeName: string,
  filters: { dateFrom: string; dateTo: string; category: string; status: string },
) {
  const win = window.open("", "_blank");
  if (!win) return;

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const bycat: Record<string, number> = {};
  expenses.forEach(e => { bycat[e.category] = (bycat[e.category] ?? 0) + Number(e.amount); });

  const rows = expenses.map(e => `
    <tr>
      <td>${fmtDate(e.date)}</td>
      <td>${e.description}</td>
      <td>${e.category}</td>
      <td>${PAYMENT_LABEL[e.payment_method] ?? e.payment_method}</td>
      <td style="text-align:right">${brl(Number(e.amount))}</td>
      <td><span style="color:${e.status==='pago'?'#10b981':'#ef4444'};font-weight:700">${e.status==='pago'?'Pago':'Pendente'}</span></td>
    </tr>`).join("");

  const catRows = Object.entries(bycat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `<tr><td>${cat}</td><td style="text-align:right;font-weight:700">${brl(val)}</td></tr>`)
    .join("");

  const filterDesc = [
    filters.dateFrom && `De: ${fmtDate(filters.dateFrom)}`,
    filters.dateTo   && `Até: ${fmtDate(filters.dateTo)}`,
    filters.category !== "todas" && `Categoria: ${filters.category}`,
    filters.status   !== "todos" && `Status: ${filters.status}`,
  ].filter(Boolean).join(" · ") || "Todos os registros";

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Relatório Financeiro — ${storeName}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;font-size:12px}
      .header{text-align:center;border-bottom:3px solid #c1121f;padding-bottom:14px;margin-bottom:20px}
      .header h1{font-size:20px;color:#c1121f;font-weight:800}
      .header p{font-size:11px;color:#666;margin-top:4px}
      .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;border-bottom:1px solid #eee;padding-bottom:4px;margin:16px 0 10px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f3f4f6;font-weight:700;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
      td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
      tr:last-child td{border-bottom:none}
      .total-box{background:#f8f8f8;border:1px solid #ddd;border-radius:6px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:16px}
      .total-box .label{font-size:12px;font-weight:700;color:#333}
      .total-box .value{font-size:18px;font-weight:800;color:#c1121f}
      @media print{body{padding:0}}
    </style>
  </head><body>
    <div class="header">
      <h1>${storeName}</h1>
      <p>Relatório Financeiro da Loja · Gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
      <p style="margin-top:6px;font-size:10px;color:#999">${filterDesc}</p>
    </div>

    <div class="section-title">Resumo por Categoria</div>
    <table>
      <thead><tr><th>Categoria</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>

    <div class="section-title">Despesas Detalhadas</div>
    <table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th style="text-align:right">Valor</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="total-box">
      <span class="label">Total do Período</span>
      <span class="value">${brl(total)}</span>
    </div>
  </body></html>`);
  win.document.close();
  win.print();
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════ */
export default function FinanceiroLojaPage() {
  const [userId, setUserId]       = useState<string | null>(null);
  const [storeName, setStoreName] = useState("CRM 7Business");
  const [tab, setTab]             = useState<"dashboard" | "despesas" | "relatorio">("dashboard");

  // dados
  const [expenses, setExpenses]             = useState<Expense[]>([]);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpense[]>([]);
  const [sales, setSales]                   = useState<Sale[]>([]);
  const [loading, setLoading]               = useState(true);

  // filtros
  const [search, setSearch]           = useState("");
  const [filterCat, setFilterCat]     = useState("todas");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterPay, setFilterPay]     = useState("todos");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");

  // modal
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState<Expense | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [saving, setSaving]           = useState(false);

  /* ── auth ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      fetch(`/api/settings?userId=${data.user.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.business_name) setStoreName(d.business_name); })
        .catch(() => {});
    });
  }, []);

  /* ── fetch tudo ── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [expRes, repRes] = await Promise.all([
      fetch("/api/financeiro-loja"),
      fetch("/api/financeiro-loja?mode=report"),
    ]);
    if (expRes.ok) setExpenses(await expRes.json());
    if (repRes.ok) {
      const rep = await repRes.json();
      setVehicleExpenses(rep.vehicle_expenses ?? []);
      setSales(rep.sales ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── filtros aplicados ── */
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (filterCat    !== "todas" && e.category       !== filterCat)    return false;
      if (filterStatus !== "todos" && e.status         !== filterStatus) return false;
      if (filterPay    !== "todos" && e.payment_method !== filterPay)    return false;
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo   && e.date > dateTo)   return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.description.toLowerCase().includes(q) &&
            !e.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [expenses, filterCat, filterStatus, filterPay, dateFrom, dateTo, search]);

  /* ── KPIs Dashboard ── */
  const kpi = useMemo(() => {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const storeTotal    = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const storePendente = expenses.filter(e => e.status === "pendente").reduce((s, e) => s + Number(e.amount), 0);
    const storeMes      = expenses.filter(e => e.date.startsWith(curMonth)).reduce((s, e) => s + Number(e.amount), 0);

    const veiculoTotal  = vehicleExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const veiculoMes    = vehicleExpenses.filter(e => e.date?.startsWith(curMonth)).reduce((s, e) => s + Number(e.amount), 0);

    const receitaTotal  = sales.filter(s => s.status === "pago").reduce((s, v) => s + Number(v.total_value), 0);
    const receitaMes    = sales.filter(s => s.status === "pago" && s.closing_date?.startsWith(curMonth))
                               .reduce((s, v) => s + Number(v.total_value), 0);

    const totalCustoMes  = storeMes + veiculoMes;
    const resultadoMes   = receitaMes - totalCustoMes;
    const resultadoTotal = receitaTotal - storeTotal - veiculoTotal;

    return {
      storeTotal, storePendente, storeMes,
      veiculoTotal, veiculoMes,
      receitaTotal, receitaMes,
      totalCustoMes, resultadoMes, resultadoTotal,
    };
  }, [expenses, vehicleExpenses, sales]);

  /* ── por categoria (loja) ── */
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => { map[e.category] = (map[e.category] ?? 0) + Number(e.amount); });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, color: CAT_COLORS[label] ?? "#6b7280" }));
  }, [expenses]);

  /* ── por mês (últimos 6) ── */
  const byMonth = useMemo(() => {
    const map: Record<string, { store: number; veiculo: number; receita: number }> = {};
    const add = (key: string) => { if (!map[key]) map[key] = { store: 0, veiculo: 0, receita: 0 }; };
    expenses.forEach(e => { const k = monthKey(e.date); add(k); map[k].store += Number(e.amount); });
    vehicleExpenses.forEach(e => { if (!e.date) return; const k = monthKey(e.date); add(k); map[k].veiculo += Number(e.amount); });
    sales.filter(s => s.status === "pago").forEach(s => { const k = monthKey(s.closing_date); add(k); map[k].receita += Number(s.total_value); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [expenses, vehicleExpenses, sales]);

  /* ── modal helpers ── */
  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      date: e.date, description: e.description, category: e.category,
      amount: String(e.amount), payment_method: e.payment_method,
      status: e.status, notes: e.notes ?? "",
    });
    setShowModal(true);
  }

  async function saveForm() {
    if (!form.description || !form.amount) return;
    setSaving(true);
    const payload = { ...form, amount: Number(form.amount), store_id: userId };

    if (editing) {
      const res = await fetch("/api/financeiro-loja", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...payload }),
      });
      if (!res.ok) { alert("Erro ao salvar"); setSaving(false); return; }
    } else {
      const res = await fetch("/api/financeiro-loja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { alert("Erro ao criar"); setSaving(false); return; }
    }

    setSaving(false);
    setShowModal(false);
    fetchAll();
  }

  async function toggleStatus(e: Expense) {
    await fetch("/api/financeiro-loja", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, status: e.status === "pago" ? "pendente" : "pago" }),
    });
    fetchAll();
  }

  async function deleteExpense(id: string) {
    if (!confirm("Excluir esta despesa?")) return;
    await fetch(`/api/financeiro-loja?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  /* ── Shortcut month filter ── */
  function setMonth(offset: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    setDateFrom(`${y}-${m}-01`);
    setDateTo(`${y}-${m}-${new Date(y, d.getMonth() + 1, 0).getDate()}`);
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  const inputStyle = { background: "#111827", borderColor: "#374151" };
  const sectionBg  = { background: "#0f172a", border: "1px solid #1f2937" };

  const TAB_STYLE = (active: boolean) => ({
    background: active ? "rgba(230,57,70,0.15)" : "transparent",
    color:      active ? "#f87171" : "#6b7280",
    borderBottom: active ? "2px solid #e63946" : "2px solid transparent",
  });

  return (
    <main className="min-h-screen p-4 sm:p-6" style={{ background: "#0a0f1a" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🏪 Financeiro da Loja</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Controle de despesas operacionais e visão consolidada</p>
        </div>
        <button onClick={openNew}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white flex items-center gap-2 hover:opacity-90"
          style={{ background: "#e63946" }}>
          + Nova Despesa
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "#1f2937" }}>
        {(["dashboard", "despesas", "relatorio"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-semibold capitalize transition-all"
            style={TAB_STYLE(tab === t)}>
            {t === "dashboard" ? "📊 Dashboard" : t === "despesas" ? "📋 Despesas" : "📄 Relatório"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Carregando…</div>
      ) : (
        <>
          {/* ══ TAB DASHBOARD ══ */}
          {tab === "dashboard" && (
            <div className="space-y-6">
              {/* KPI Cards — Mês Atual */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>
                  📅 Mês Atual
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Receita (Vendas)", value: kpi.receitaMes,   color: "#10b981", icon: "💰" },
                    { label: "Custos da Loja",   value: kpi.storeMes,     color: "#e63946", icon: "🏪" },
                    { label: "Custos Veículos",  value: kpi.veiculoMes,   color: "#f59e0b", icon: "🚗" },
                    { label: "Resultado Líquido",value: kpi.resultadoMes, color: kpi.resultadoMes >= 0 ? "#10b981" : "#ef4444", icon: "📈" },
                  ].map(c => (
                    <div key={c.label} className="rounded-2xl p-4" style={sectionBg}>
                      <p className="text-xl mb-1">{c.icon}</p>
                      <p className="text-[11px] font-semibold mb-1" style={{ color: "#6b7280" }}>{c.label}</p>
                      <p className="text-xl font-black" style={{ color: c.color }}>{brl(c.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* KPI Cards — Acumulado */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>
                  📊 Acumulado Total
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Receita Total",      value: kpi.receitaTotal,   color: "#10b981", icon: "💵" },
                    { label: "Despesas da Loja",   value: kpi.storeTotal,     color: "#e63946", icon: "📤" },
                    { label: "Despesas Veículos",  value: kpi.veiculoTotal,   color: "#f59e0b", icon: "🔧" },
                    { label: "Resultado Acumulado",value: kpi.resultadoTotal, color: kpi.resultadoTotal >= 0 ? "#10b981" : "#ef4444", icon: "🏆" },
                  ].map(c => (
                    <div key={c.label} className="rounded-2xl p-4" style={sectionBg}>
                      <p className="text-xl mb-1">{c.icon}</p>
                      <p className="text-[11px] font-semibold mb-1" style={{ color: "#6b7280" }}>{c.label}</p>
                      <p className="text-xl font-black" style={{ color: c.color }}>{brl(c.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pendentes */}
              {kpi.storePendente > 0 && (
                <div className="rounded-2xl p-4 flex items-center gap-4"
                  style={{ background: "#ef444415", border: "1px solid #ef444430" }}>
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-white">Despesas Pendentes</p>
                    <p className="text-xs" style={{ color: "#9ca3af" }}>Você tem <strong style={{ color: "#ef4444" }}>{brl(kpi.storePendente)}</strong> em despesas aguardando pagamento</p>
                  </div>
                  <button onClick={() => { setTab("despesas"); setFilterStatus("pendente"); }}
                    className="ml-auto rounded-xl px-4 py-2 text-xs font-bold"
                    style={{ background: "#ef4444", color: "#fff" }}>
                    Ver pendentes
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Despesas por Categoria */}
                <div className="rounded-2xl p-5" style={sectionBg}>
                  <p className="text-sm font-bold text-white mb-4">🗂️ Despesas por Categoria</p>
                  {byCategory.length ? <BarChart data={byCategory} /> : (
                    <p className="text-sm text-center py-6" style={{ color: "#6b7280" }}>Nenhuma despesa cadastrada</p>
                  )}
                </div>

                {/* Evolução Mensal */}
                <div className="rounded-2xl p-5" style={sectionBg}>
                  <p className="text-sm font-bold text-white mb-4">📈 Evolução Mensal (últimos 6 meses)</p>
                  {byMonth.length ? (
                    <div className="space-y-3">
                      {byMonth.map(([key, val]) => {
                        const custo = val.store + val.veiculo;
                        const resultado = val.receita - custo;
                        return (
                          <div key={key} className="rounded-xl p-3" style={{ background: "#111827" }}>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-white">{monthLabel(key)}</span>
                              <span className="text-xs font-bold" style={{ color: resultado >= 0 ? "#10b981" : "#ef4444" }}>
                                {resultado >= 0 ? "+" : ""}{brl(resultado)}
                              </span>
                            </div>
                            <div className="flex gap-2 text-[10px]">
                              <span style={{ color: "#10b981" }}>↑ {brl(val.receita)}</span>
                              <span style={{ color: "#6b7280" }}>·</span>
                              <span style={{ color: "#e63946" }}>↓ {brl(custo)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-center py-6" style={{ color: "#6b7280" }}>Sem dados mensais</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ TAB DESPESAS ══ */}
          {tab === "despesas" && (
            <div className="space-y-4">
              {/* Filtros */}
              <div className="rounded-2xl p-4" style={sectionBg}>
                <div className="flex flex-wrap gap-3">
                  <input type="text" placeholder="🔍 Buscar..." value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500 flex-1 min-w-40"
                    style={inputStyle} />
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todas">Todas categorias</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todos">Todos status</option>
                    <option value="pago">Pago</option>
                    <option value="pendente">Pendente</option>
                  </select>
                  <select value={filterPay} onChange={e => setFilterPay(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todos">Todas formas</option>
                    {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={inputStyle} />
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={inputStyle} />
                  </div>
                  <button onClick={() => { setDateFrom(""); setDateTo(""); setFilterCat("todas"); setFilterStatus("todos"); setFilterPay("todos"); setSearch(""); }}
                    className="rounded-xl px-3 py-2 text-xs font-semibold"
                    style={{ background: "#1f2937", color: "#9ca3af" }}>
                    Limpar
                  </button>
                </div>
                {/* Atalhos de período */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {[
                    { label: "Este mês",  fn: () => setMonth(0) },
                    { label: "Mês passado", fn: () => setMonth(-1) },
                    { label: "Últimos 3 meses", fn: () => { const d = new Date(); d.setMonth(d.getMonth()-2); setDateFrom(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`); setDateTo(new Date().toISOString().split("T")[0]); } },
                  ].map(a => (
                    <button key={a.label} onClick={a.fn}
                      className="rounded-lg px-3 py-1 text-xs font-semibold"
                      style={{ background: "#1f2937", color: "#9ca3af" }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Totais filtrados */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total do filtro", value: filtered.reduce((s,e) => s+Number(e.amount),0), color: "#e5e7eb" },
                  { label: "Pagas",           value: filtered.filter(e=>e.status==="pago").reduce((s,e) => s+Number(e.amount),0), color: "#10b981" },
                  { label: "Pendentes",       value: filtered.filter(e=>e.status==="pendente").reduce((s,e) => s+Number(e.amount),0), color: "#ef4444" },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl px-4 py-3" style={sectionBg}>
                    <p className="text-[10px] font-semibold" style={{ color: "#6b7280" }}>{c.label}</p>
                    <p className="text-lg font-black" style={{ color: c.color }}>{brl(c.value)}</p>
                  </div>
                ))}
              </div>

              {/* Tabela */}
              <div className="rounded-2xl overflow-hidden" style={sectionBg}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                      {["Data","Descrição","Categoria","Pagamento","Valor","Status","Ações"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: "#6b7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-600">Nenhuma despesa encontrada</td></tr>
                    )}
                    {filtered.map(e => (
                      <tr key={e.id} className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: "1px solid #1f293740" }}>
                        <td className="px-4 py-3 text-white">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">{e.description}</p>
                          {e.notes && <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>{e.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-1 rounded-lg"
                            style={{ background: (CAT_COLORS[e.category] ?? "#6b7280") + "22", color: CAT_COLORS[e.category] ?? "#9ca3af" }}>
                            {e.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#9ca3af" }}>
                          {PAYMENT_LABEL[e.payment_method] ?? e.payment_method}
                        </td>
                        <td className="px-4 py-3 font-bold text-white">{brl(Number(e.amount))}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleStatus(e)}
                            className="text-xs font-bold px-3 py-1 rounded-full transition-all hover:opacity-80"
                            style={{
                              background: e.status === "pago" ? "#10b98122" : "#ef444422",
                              color:      e.status === "pago" ? "#10b981"   : "#ef4444",
                            }}>
                            {e.status === "pago" ? "✓ Pago" : "⏳ Pendente"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(e)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                              style={{ background: "#1f2937", color: "#9ca3af" }}>✏️</button>
                            <button onClick={() => deleteExpense(e.id)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                              style={{ background: "#ef444415", color: "#ef4444" }}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ TAB RELATÓRIO ══ */}
          {tab === "relatorio" && (
            <div className="space-y-5">
              {/* Filtros relatório */}
              <div className="rounded-2xl p-4" style={sectionBg}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>Filtros do Relatório</p>
                <div className="flex flex-wrap gap-3">
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todas">Todas categorias</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todos">Todos status</option>
                    <option value="pago">Pago</option>
                    <option value="pendente">Pendente</option>
                  </select>
                  <select value={filterPay} onChange={e => setFilterPay(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todos">Todas formas</option>
                    {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle} />
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle} />
                  <div className="flex gap-2">
                    {[{l:"Este mês",f:()=>setMonth(0)},{l:"Mês passado",f:()=>setMonth(-1)}].map(a=>(
                      <button key={a.l} onClick={a.f}
                        className="rounded-xl px-3 py-2 text-xs font-semibold"
                        style={{ background: "#1f2937", color: "#9ca3af" }}>{a.l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Resumo por categoria */}
              <div className="rounded-2xl p-5" style={sectionBg}>
                <p className="text-sm font-bold text-white mb-4">📊 Resumo por Categoria</p>
                <div className="space-y-2">
                  {(() => {
                    const catMap: Record<string, number> = {};
                    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] ?? 0) + Number(e.amount); });
                    const items = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
                    if (!items.length) return <p className="text-sm text-center py-4" style={{ color: "#6b7280" }}>Nenhum dado</p>;
                    const max = Math.max(...items.map(i=>i[1]));
                    return items.map(([cat, val]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-xs w-36 shrink-0 truncate" style={{ color: "#9ca3af" }}>{cat}</span>
                        <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: "#1f2937" }}>
                          <div className="h-5 rounded-full" style={{ width: `${(val/max)*100}%`, background: CAT_COLORS[cat] ?? "#6b7280" }} />
                        </div>
                        <span className="text-sm font-bold w-24 text-right shrink-0 text-white">{brl(val)}</span>
                        <span className="text-[10px] w-10 text-right shrink-0" style={{ color: "#6b7280" }}>
                          {((val/filtered.reduce((s,e)=>s+Number(e.amount),0.001))*100).toFixed(1)}%
                        </span>
                      </div>
                    ));
                  })()}
                </div>
                <div className="mt-4 flex justify-between items-center border-t pt-4" style={{ borderColor: "#1f2937" }}>
                  <span className="text-sm font-bold text-white">Total do Período</span>
                  <span className="text-2xl font-black" style={{ color: "#e63946" }}>
                    {brl(filtered.reduce((s,e)=>s+Number(e.amount),0))}
                  </span>
                </div>
              </div>

              {/* Totais mensais */}
              <div className="rounded-2xl p-5" style={sectionBg}>
                <p className="text-sm font-bold text-white mb-4">📅 Totais Mensais</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(() => {
                    const mm: Record<string, number> = {};
                    filtered.forEach(e => { const k = monthKey(e.date); mm[k] = (mm[k]??0)+Number(e.amount); });
                    return Object.entries(mm).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) => (
                      <div key={k} className="rounded-xl p-3" style={{ background: "#111827" }}>
                        <p className="text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>{monthLabel(k)}</p>
                        <p className="text-base font-black" style={{ color: "#e63946" }}>{brl(v)}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Botão PDF */}
              <button
                onClick={() => printReport(filtered, storeName, { dateFrom, dateTo, category: filterCat, status: filterStatus })}
                className="w-full rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
                style={{ background: "#e63946" }}>
                🖨️ Exportar Relatório em PDF
              </button>
            </div>
          )}
        </>
      )}

      {/* ══ MODAL NOVA / EDITAR DESPESA ══ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-base font-black text-white">
                {editing ? "✏️ Editar Despesa" : "➕ Nova Despesa"}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                style={{ background: "#1f2937" }}>✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data</label>
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                    style={inputStyle} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Status</label>
                  <select value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as "pago" | "pendente" }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="pago">✅ Pago</option>
                    <option value="pendente">⏳ Pendente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Descrição *</label>
                <input type="text" placeholder="Ex: Aluguel do ponto comercial" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                  style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Categoria</label>
                  <select value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor (R$) *</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                    style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Forma de Pagamento</label>
                <select value={form.payment_method}
                  onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                  style={inputStyle}>
                  {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Observações</label>
                <textarea rows={2} placeholder="Detalhes adicionais..." value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none resize-none"
                  style={inputStyle} />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={saveForm} disabled={saving || !form.description || !form.amount}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#e63946" }}>
                {saving ? "Salvando…" : editing ? "✓ Salvar Alterações" : "✓ Cadastrar Despesa"}
              </button>
              <button onClick={() => setShowModal(false)}
                className="rounded-xl px-5 py-3 text-sm font-semibold"
                style={{ background: "#1f2937", color: "#9ca3af" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
