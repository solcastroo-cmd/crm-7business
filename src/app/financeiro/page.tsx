"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES = [
  "Oficina","Pneus","Combustível","Documentação",
  "Multas","Taxas","IPVA/Seguro","Comissão Vendedor","Outros",
];

type Expense = {
  id: string;
  vehicle_id: string;
  date: string;
  category: string;
  description?: string;
  amount: number;
};

type VehicleFinancial = {
  id: string;
  brand: string;
  model: string;
  year?: string;
  plate?: string;
  color?: string;
  status: string;
  photos?: string[];
  purchase_price?: number;
  actual_sale_price?: number;
  total_expenses: number;
  expenses: Expense[];
  created_at?: string;
};

type ExpenseForm = {
  date: string;
  category: string;
  description: string;
  amount: string;
};

const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  reservado:  "Reservado",
  vendido:    "Vendido",
};

const STATUS_COLOR: Record<string, string> = {
  disponivel: "#10b981",
  reservado:  "#f59e0b",
  vendido:    "#6b7280",
};

const CAT_ICON: Record<string, string> = {
  Oficina:              "🔧",
  Pneus:                "🛞",
  Combustível:          "⛽",
  Documentação:         "📄",
  Multas:               "⚠️",
  Taxas:                "🏛️",
  "IPVA/Seguro":        "🛡️",
  "Comissão Vendedor":  "💸",
  Outros:               "📦",
};

function brl(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

function calcFinancials(v: VehicleFinancial, overridePurchase?: number, overrideSale?: number) {
  const purchase     = overridePurchase ?? v.purchase_price ?? 0;
  const investimento = purchase + v.total_expenses;
  const sale         = overrideSale ?? v.actual_sale_price;
  const lucro        = sale != null ? sale - investimento : null;
  const margem       = lucro != null && sale ? (lucro / sale) * 100 : null;
  return { investimento, lucro, margem };
}

function LucroBadge({ lucro, margem }: { lucro: number | null; margem: number | null }) {
  if (lucro === null) return <span style={{ color: "#6b7280" }} className="text-xs">Sem venda</span>;
  const positive = lucro >= 0;
  return (
    <span className="text-xs font-bold" style={{ color: positive ? "#10b981" : "#ef4444" }}>
      {positive ? "▲" : "▼"} {brl(Math.abs(lucro))}
      {margem !== null && <span className="ml-1 font-normal opacity-80">({margem.toFixed(1)}%)</span>}
    </span>
  );
}

export default function FinanceiroPage() {
  const [userId, setUserId]         = useState<string | null>(null);
  const [storeName, setStoreName]   = useState<string>("CRM 7Business");
  const [vehicles, setVehicles]     = useState<VehicleFinancial[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<"veiculos" | "relatorio">("veiculos");

  // modal
  const [modal, setModal]           = useState<VehicleFinancial | null>(null);
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [loadingExp, setLoadingExp] = useState(false);

  // vehicle prices inside modal
  const [purchaseInput, setPurchaseInput] = useState("");
  const [saleInput, setSaleInput]         = useState("");
  const [savingPrices, setSavingPrices]   = useState(false);
  const [savedPrices, setSavedPrices]     = useState(false);

  // expense form
  const emptyForm = (): ExpenseForm => ({
    date: new Date().toISOString().split("T")[0],
    category: "Oficina",
    description: "",
    amount: "",
  });
  const [expForm, setExpForm]     = useState<ExpenseForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [savingExp, setSavingExp] = useState(false);

  // relatório filters
  const [filterStatus, setFilterStatus] = useState("todos");
  const [searchRel, setSearchRel]       = useState("");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");

  /* ── auth + storeName ── */
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

  /* ── fetch vehicles ── */
  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/financeiro");
    if (res.ok) setVehicles(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  /* ── fetch expenses (modal) ── */
  const fetchExpenses = useCallback(async (vehicleId: string) => {
    setLoadingExp(true);
    const res = await fetch(`/api/financeiro/expenses?vehicle_id=${vehicleId}`);
    if (res.ok) setExpenses(await res.json());
    setLoadingExp(false);
  }, []);

  /* ── open modal ── */
  function openModal(v: VehicleFinancial) {
    setModal(v);
    setPurchaseInput(v.purchase_price?.toString() ?? "");
    setSaleInput(v.actual_sale_price?.toString() ?? "");
    setSavedPrices(false);
    setExpForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    fetchExpenses(v.id);
  }

  function closeModal() {
    setModal(null);
    setExpenses([]);
  }

  /* ── save prices ── */
  async function savePrices() {
    if (!modal) return;
    setSavingPrices(true);
    const res = await fetch("/api/financeiro/vehicle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: modal.id,
        purchase_price:    purchaseInput ? parseFloat(purchaseInput) : null,
        actual_sale_price: saleInput     ? parseFloat(saleInput)     : null,
      }),
    });
    setSavingPrices(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      alert(`Erro ao salvar valores: ${err.error ?? res.status}`);
      return;
    }
    setSavedPrices(true);
    setTimeout(() => setSavedPrices(false), 2000);
    const updated: VehicleFinancial = {
      ...modal,
      purchase_price:    purchaseInput ? parseFloat(purchaseInput) : undefined,
      actual_sale_price: saleInput     ? parseFloat(saleInput)     : undefined,
    };
    setModal(updated);
    setVehicles(prev => prev.map(v => v.id === updated.id ? { ...v, ...updated } : v));
  }

  /* ── save expense ── */
  async function saveExpense() {
    if (!modal || !expForm.amount) return;
    if (!userId) {
      alert("Sessão não carregada. Aguarde um momento e tente novamente.");
      return;
    }
    setSavingExp(true);

    if (editingId) {
      const res = await fetch("/api/financeiro/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          date:        expForm.date,
          category:    expForm.category,
          description: expForm.description,
          amount:      parseFloat(expForm.amount),
        }),
      });
      setSavingExp(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        alert(`Erro ao atualizar despesa: ${err.error ?? res.status}`);
        return;
      }
      setEditingId(null);
    } else {
      const res = await fetch("/api/financeiro/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id:  modal.id,
          store_id:    userId,
          date:        expForm.date,
          category:    expForm.category,
          description: expForm.description,
          amount:      parseFloat(expForm.amount),
        }),
      });
      setSavingExp(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        alert(`Erro ao salvar despesa: ${err.error ?? res.status}`);
        return;
      }
    }

    setExpForm(emptyForm());
    setShowForm(false);
    await fetchExpenses(modal.id);
    fetchVehicles();
  }

  async function deleteExpense(id: string) {
    if (!modal) return;
    await fetch(`/api/financeiro/expenses?id=${id}`, { method: "DELETE" });
    await fetchExpenses(modal.id);
    fetchVehicles();
  }

  function startEdit(exp: Expense) {
    setEditingId(exp.id);
    setExpForm({
      date:        exp.date?.slice(0, 10) ?? "",
      category:    exp.category,
      description: exp.description ?? "",
      amount:      exp.amount.toString(),
    });
    setShowForm(true);
  }

  /* ── computed ── */
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );

  const modalFinancials = useMemo(() => {
    if (!modal) return null;
    return calcFinancials(
      { ...modal, total_expenses: totalExpenses },
      purchaseInput ? parseFloat(purchaseInput) : 0,
      saleInput     ? parseFloat(saleInput)     : undefined,
    );
  }, [modal, purchaseInput, saleInput, totalExpenses]);

  /* ── relatório filters ── */
  const relVehicles = useMemo(() => {
    return vehicles.filter(v => {
      if (filterStatus !== "todos" && v.status !== filterStatus) return false;
      if (dateFrom && v.created_at && v.created_at < dateFrom) return false;
      if (dateTo   && v.created_at && v.created_at.slice(0, 10) > dateTo) return false;
      if (searchRel) {
        const q = searchRel.toLowerCase();
        return (
          v.brand.toLowerCase().includes(q) ||
          v.model.toLowerCase().includes(q) ||
          (v.plate ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vehicles, filterStatus, searchRel, dateFrom, dateTo]);

  const relTotals = useMemo(() => {
    return relVehicles.reduce(
      (acc, v) => {
        const { investimento, lucro } = calcFinancials(v);
        acc.investimento += investimento;
        acc.vendas       += v.actual_sale_price ?? 0;
        acc.lucro        += lucro ?? 0;
        return acc;
      },
      { investimento: 0, vendas: 0, lucro: 0 }
    );
  }, [relVehicles]);

  /* ── PDF export (discriminado por veículo) ── */
  function exportPDF() {
    const win = window.open("", "_blank");
    if (!win) return;

    const periodLabel = dateFrom || dateTo
      ? `Período: ${dateFrom ? fmtDate(dateFrom) : "início"} até ${dateTo ? fmtDate(dateTo) : "hoje"}`
      : "Todos os períodos";

    const vehicleSections = relVehicles.map(v => {
      const { investimento, lucro, margem } = calcFinancials(v);
      const expRows = (v.expenses ?? []).map(e => `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${e.category}</td>
          <td>${e.description ?? "-"}</td>
          <td style="text-align:right;font-weight:600;color:#b45309">${brl(Number(e.amount))}</td>
        </tr>`).join("");

      const expSection = v.expenses?.length
        ? `<table class="exp-table">
            <thead><tr>
              <th>Data</th><th>Categoria</th><th>Descrição</th><th style="text-align:right">Valor</th>
            </tr></thead>
            <tbody>${expRows}</tbody>
            <tfoot><tr>
              <td colspan="3" style="font-weight:700">Total Despesas</td>
              <td style="text-align:right;font-weight:700;color:#b45309">${brl(v.total_expenses)}</td>
            </tr></tfoot>
           </table>`
        : `<p style="color:#888;font-size:11px;margin:4px 0 0 8px">Nenhuma despesa lançada</p>`;

      return `
        <div class="vehicle-block">
          <div class="vehicle-header">
            <span class="vehicle-title">${v.brand} ${v.model} ${v.year ?? ""}</span>
            <span class="plate">${v.plate ?? ""}</span>
            <span class="status-badge">${STATUS_LABEL[v.status] ?? v.status}</span>
          </div>
          <div class="vehicle-body">
            <div class="values-row">
              <span>💵 Valor de Compra: <strong>${brl(v.purchase_price ?? 0)}</strong></span>
              <span>🏷️ Valor de Venda: <strong>${v.actual_sale_price ? brl(v.actual_sale_price) : "—"}</strong></span>
              <span>📦 Investimento Total: <strong>${brl(investimento)}</strong></span>
              <span style="color:${lucro == null ? "#888" : lucro >= 0 ? "green" : "red"}">
                ${lucro == null ? "⏳ Aguardando venda" : lucro >= 0
                  ? `✅ Lucro: <strong>${brl(lucro)}</strong> (${margem?.toFixed(1)}%)`
                  : `❌ Prejuízo: <strong>${brl(lucro)}</strong> (${margem?.toFixed(1)}%)`}
              </span>
            </div>
            <p style="font-size:11px;font-weight:700;color:#555;margin:10px 0 4px">DESPESAS DETALHADAS</p>
            ${expSection}
          </div>
        </div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Relatório Financeiro — ${storeName}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:28px;color:#1a1a1a;font-size:13px}
        .header{border-bottom:3px solid #c1121f;padding-bottom:12px;margin-bottom:20px}
        .header h1{color:#c1121f;margin:0;font-size:20px}
        .header .meta{color:#666;font-size:12px;margin-top:4px}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
        .summary-card{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:10px;text-align:center}
        .summary-card .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px}
        .summary-card .value{font-size:15px;font-weight:800;margin-top:2px}
        .vehicle-block{border:1px solid #ddd;border-radius:8px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid}
        .vehicle-header{background:#f0f0f0;padding:8px 12px;display:flex;align-items:center;gap:10px}
        .vehicle-title{font-weight:700;font-size:13px}
        .plate{background:#fff;border:1px solid #ccc;border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace}
        .status-badge{font-size:10px;background:#e8e8e8;border-radius:10px;padding:2px 8px;color:#555}
        .vehicle-body{padding:10px 12px}
        .values-row{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;font-size:12px;margin-bottom:10px}
        .exp-table{width:100%;border-collapse:collapse;font-size:11px}
        .exp-table th{background:#f5f5f5;padding:5px 8px;text-align:left;border:1px solid #ddd;font-size:10px}
        .exp-table td{padding:4px 8px;border:1px solid #eee}
        .exp-table tfoot td{background:#fff8e7;border-top:2px solid #ddd}
        .totals-section{background:#1a1a2e;color:#fff;border-radius:8px;padding:14px 18px;margin-top:24px}
        .totals-section h3{margin:0 0 10px;font-size:14px;color:#ffd700}
        .totals-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .total-item .tl{font-size:10px;color:#aaa}
        .total-item .tv{font-size:16px;font-weight:800}
        @media print{body{padding:12px}.vehicle-block{page-break-inside:avoid}}
      </style>
    </head><body>
      <div class="header">
        <h1>💰 Relatório Financeiro</h1>
        <div class="meta">
          <strong>${storeName}</strong> &nbsp;·&nbsp;
          Gerado em ${new Date().toLocaleDateString("pt-BR")} &nbsp;·&nbsp;
          ${periodLabel} &nbsp;·&nbsp;
          ${filterStatus === "todos" ? "Todos os status" : STATUS_LABEL[filterStatus] ?? filterStatus} &nbsp;·&nbsp;
          ${relVehicles.length} veículo(s)
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="label">🚗 Veículos</div>
          <div class="value" style="color:#3b82f6">${relVehicles.length}</div>
        </div>
        <div class="summary-card">
          <div class="label">📉 Total Investido</div>
          <div class="value" style="color:#b45309">${brl(relTotals.investimento)}</div>
        </div>
        <div class="summary-card">
          <div class="label">📈 Total Vendas</div>
          <div class="value" style="color:#047857">${brl(relTotals.vendas)}</div>
        </div>
        <div class="summary-card">
          <div class="label">${relTotals.lucro >= 0 ? "✅ Lucro" : "❌ Prejuízo"}</div>
          <div class="value" style="color:${relTotals.lucro >= 0 ? "#047857" : "#dc2626"}">${brl(relTotals.lucro)}</div>
        </div>
      </div>

      ${vehicleSections}

      <div class="totals-section">
        <h3>📊 Resultado Consolidado — ${storeName}</h3>
        <div class="totals-grid">
          <div class="total-item">
            <div class="tl">Total Investido</div>
            <div class="tv" style="color:#fbbf24">${brl(relTotals.investimento)}</div>
          </div>
          <div class="total-item">
            <div class="tl">Total em Vendas</div>
            <div class="tv" style="color:#34d399">${brl(relTotals.vendas)}</div>
          </div>
          <div class="total-item">
            <div class="tl">${relTotals.lucro >= 0 ? "Lucro Total" : "Prejuízo Total"}</div>
            <div class="tv" style="color:${relTotals.lucro >= 0 ? "#4ade80" : "#f87171"}">${brl(relTotals.lucro)}</div>
          </div>
        </div>
      </div>
    </body></html>`);
    win.document.close();
    win.print();
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-screen overflow-y-auto" style={{ background: "#0f172a" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              💰 Módulo Financeiro
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
              {storeName} · Controle de custos, investimento e lucro por veículo
            </p>
          </div>
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#1f2937" }}>
            {(["veiculos", "relatorio"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-5 py-2.5 text-sm font-semibold transition-all"
                style={{ background: tab === t ? "#e63946" : "#111827", color: tab === t ? "#fff" : "#9ca3af" }}>
                {t === "veiculos" ? "🚗 Veículos" : "📊 Relatório"}
              </button>
            ))}
          </div>
        </div>

        {/* ════ TAB VEÍCULOS ════ */}
        {tab === "veiculos" && (
          <>
            {loading ? (
              <div className="text-center py-20 text-gray-500">Carregando...</div>
            ) : vehicles.length === 0 ? (
              <div className="text-center py-20" style={{ color: "#6b7280" }}>
                <p className="text-4xl mb-3">🚗</p>
                <p className="text-lg font-semibold">Nenhum veículo no estoque</p>
                <p className="text-sm mt-1">Cadastre veículos no Estoque para aparecerem aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {vehicles.map(v => {
                  const { investimento, lucro, margem } = calcFinancials(v);
                  const thumb = v.photos?.[0];
                  return (
                    <button key={v.id} onClick={() => openModal(v)}
                      className="text-left rounded-2xl overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: "#111827", border: "1px solid #1f2937", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                      <div className="w-full h-32 flex items-center justify-center text-4xl" style={{ background: "#1f2937" }}>
                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : "🚗"}
                      </div>
                      <div className="p-3 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: `${STATUS_COLOR[v.status] ?? "#6b7280"}22`, color: STATUS_COLOR[v.status] ?? "#6b7280" }}>
                          {STATUS_LABEL[v.status] ?? v.status}
                        </span>
                        <p className="text-sm font-bold text-white leading-tight">{v.brand} {v.model}</p>
                        <p className="text-xs" style={{ color: "#6b7280" }}>{[v.year, v.plate].filter(Boolean).join(" · ")}</p>
                        <div className="rounded-xl p-2 space-y-1" style={{ background: "#0f172a" }}>
                          <div className="flex justify-between text-xs">
                            <span style={{ color: "#6b7280" }}>Investimento</span>
                            <span className="font-semibold text-white">{brl(investimento)}</span>
                          </div>
                          <div className="flex justify-between text-xs items-center">
                            <span style={{ color: "#6b7280" }}>Resultado</span>
                            <LucroBadge lucro={lucro} margem={margem} />
                          </div>
                        </div>
                        <p className="text-[10px] text-center" style={{ color: "#374151" }}>Clique para gerenciar</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════ TAB RELATÓRIO ════ */}
        {tab === "relatorio" && (
          <div className="space-y-4">

            {/* Filters */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "#111827", border: "1px solid #1f2937" }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>🔍 Filtros</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Buscar veículo / placa</label>
                  <input placeholder="Ex: Corolla, ABC-1234..."
                    value={searchRel} onChange={e => setSearchRel(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 border focus:outline-none focus:border-red-500"
                    style={{ background: "#0f172a", borderColor: "#1f2937" }} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none"
                    style={{ background: "#0f172a", borderColor: "#1f2937" }}>
                    <option value="todos">Todos os status</option>
                    <option value="disponivel">Disponível</option>
                    <option value="reservado">Reservado</option>
                    <option value="vendido">Vendido</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data inicial (entrada)</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-red-500"
                    style={{ background: "#0f172a", borderColor: "#1f2937", colorScheme: "dark" }} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data final (entrada)</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-red-500"
                    style={{ background: "#0f172a", borderColor: "#1f2937", colorScheme: "dark" }} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={exportPDF}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "#e63946" }}>
                  📄 Exportar PDF Discriminado
                </button>
                {(searchRel || filterStatus !== "todos" || dateFrom || dateTo) && (
                  <button onClick={() => { setSearchRel(""); setFilterStatus("todos"); setDateFrom(""); setDateTo(""); }}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                    style={{ background: "#1f2937", color: "#9ca3af" }}>
                    ✕ Limpar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Veículos",       value: relVehicles.length.toString(), icon: "🚗", color: "#3b82f6" },
                { label: "Total Investido", value: brl(relTotals.investimento),  icon: "📉", color: "#f59e0b" },
                { label: "Total em Vendas", value: brl(relTotals.vendas),        icon: "📈", color: "#10b981" },
                { label: "Lucro da Loja",   value: brl(relTotals.lucro),
                  icon: relTotals.lucro >= 0 ? "✅" : "❌",
                  color: relTotals.lucro >= 0 ? "#10b981" : "#ef4444" },
              ].map(card => (
                <div key={card.label} className="rounded-2xl p-4" style={{ background: "#111827", border: "1px solid #1f2937" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>{card.icon} {card.label}</p>
                  <p className="text-lg font-black" style={{ color: card.color }}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid #1f2937" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1f2937" }}>
                      {["Veículo","Placa","Status","Compra","Despesas","Investimento","Venda","Lucro/Prej.","Margem"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relVehicles.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center" style={{ color: "#6b7280" }}>Nenhum veículo encontrado</td></tr>
                    ) : relVehicles.map((v, i) => {
                      const { investimento, lucro, margem } = calcFinancials(v);
                      return (
                        <tr key={v.id} style={{ borderBottom: "1px solid #1f2937", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-white">{v.brand} {v.model}</p>
                            <p className="text-xs" style={{ color: "#6b7280" }}>{v.year ?? ""}</p>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{v.plate ?? "-"}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${STATUS_COLOR[v.status] ?? "#6b7280"}22`, color: STATUS_COLOR[v.status] ?? "#6b7280" }}>
                              {STATUS_LABEL[v.status] ?? v.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-white">{brl(v.purchase_price ?? 0)}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "#f59e0b" }}>{brl(v.total_expenses)}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-white">{brl(investimento)}</td>
                          <td className="px-4 py-3 text-xs text-white">
                            {v.actual_sale_price ? brl(v.actual_sale_price) : <span style={{ color: "#374151" }}>-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold"
                            style={{ color: lucro == null ? "#6b7280" : lucro >= 0 ? "#10b981" : "#ef4444" }}>
                            {lucro != null ? brl(lucro) : "-"}
                          </td>
                          <td className="px-4 py-3 text-xs"
                            style={{ color: margem == null ? "#6b7280" : margem >= 0 ? "#10b981" : "#ef4444" }}>
                            {margem != null ? `${margem.toFixed(1)}%` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {relVehicles.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #1f2937", background: "#0f172a" }}>
                        <td colSpan={5} className="px-4 py-3 text-xs font-bold" style={{ color: "#9ca3af" }}>
                          TOTAIS — {relVehicles.length} veículos
                        </td>
                        <td className="px-4 py-3 text-sm font-black text-white">{brl(relTotals.investimento)}</td>
                        <td className="px-4 py-3 text-sm font-black text-white">{brl(relTotals.vendas)}</td>
                        <td className="px-4 py-3 text-sm font-black"
                          style={{ color: relTotals.lucro >= 0 ? "#10b981" : "#ef4444" }}>
                          {brl(relTotals.lucro)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════ MODAL DETALHES DO VEÍCULO ════ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ background: "#111827", borderBottom: "1px solid #1f2937" }}>
              <div>
                <h2 className="text-lg font-black text-white">{modal.brand} {modal.model} {modal.year ?? ""}</h2>
                <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                  {[modal.plate, modal.color].filter(Boolean).join(" · ")}
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: `${STATUS_COLOR[modal.status] ?? "#6b7280"}22`, color: STATUS_COLOR[modal.status] ?? "#6b7280" }}>
                    {STATUS_LABEL[modal.status] ?? modal.status}
                  </span>
                </p>
              </div>
              <button onClick={closeModal}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-colors text-lg"
                style={{ background: "#1f2937" }}>✕</button>
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* Valores */}
              <div className="rounded-2xl p-4 space-y-4" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>💵 Valores</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-white">Valor de Compra (R$)</label>
                    <input type="number" step="0.01" placeholder="Ex: 45000.00"
                      value={purchaseInput} onChange={e => setPurchaseInput(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-red-500"
                      style={{ background: "#111827", borderColor: "#374151" }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-white">Valor de Venda (R$)</label>
                    <input type="number" step="0.01" placeholder="Preencher ao vender"
                      value={saleInput} onChange={e => setSaleInput(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-red-500"
                      style={{ background: "#111827", borderColor: "#374151" }} />
                  </div>
                </div>
                <button onClick={savePrices} disabled={savingPrices}
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: savedPrices ? "#10b981" : "#e63946" }}>
                  {savingPrices ? "Salvando…" : savedPrices ? "✓ Salvo!" : "Salvar Valores"}
                </button>
              </div>

              {/* Despesas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>🧾 Despesas</p>
                  <button onClick={() => { setShowForm(!showForm); setEditingId(null); setExpForm(emptyForm()); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: "#e6394622", color: "#f87171", border: "1px solid #e6394640" }}>
                    {showForm && !editingId ? "✕ Cancelar" : "+ Adicionar Gasto"}
                  </button>
                </div>

                {showForm && (
                  <div className="rounded-2xl p-4 space-y-3" style={{ background: "#0f172a", border: "1px solid #374151" }}>
                    <p className="text-xs font-semibold text-white">{editingId ? "✏️ Editar despesa" : "➕ Nova despesa"}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data</label>
                        <input type="date" value={expForm.date}
                          onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-xs text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151", colorScheme: "dark" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Categoria</label>
                        <select value={expForm.category}
                          onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-xs text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Descrição</label>
                        <input type="text" placeholder="Ex: Revisão geral"
                          value={expForm.description}
                          onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-xs text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor (R$)</label>
                        <input type="number" step="0.01" placeholder="0.00"
                          value={expForm.amount}
                          onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-xs text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveExpense} disabled={savingExp || !expForm.amount || !userId}
                        className="rounded-lg px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ background: "#e63946" }}>
                        {!userId ? "Aguardando sessão…" : savingExp ? "Salvando…" : editingId ? "Atualizar" : "Adicionar"}
                      </button>
                      <button onClick={() => { setShowForm(false); setEditingId(null); setExpForm(emptyForm()); }}
                        className="rounded-lg px-4 py-2 text-xs font-semibold transition-all" style={{ color: "#6b7280" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {loadingExp ? (
                  <p className="text-xs text-gray-500 py-4 text-center">Carregando despesas…</p>
                ) : expenses.length === 0 ? (
                  <div className="rounded-2xl py-8 text-center" style={{ background: "#0f172a", border: "1px dashed #1f2937" }}>
                    <p className="text-2xl mb-1">🧾</p>
                    <p className="text-xs" style={{ color: "#6b7280" }}>Nenhuma despesa lançada</p>
                  </div>
                ) : (
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1f2937" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#0f172a", borderBottom: "1px solid #1f2937" }}>
                          {["Data","Categoria","Descrição","Valor",""].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "#6b7280" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((exp, i) => (
                          <tr key={exp.id} style={{ borderBottom: i < expenses.length - 1 ? "1px solid #1f2937" : "none", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                            <td className="px-3 py-2.5 text-gray-400">{fmtDate(exp.date)}</td>
                            <td className="px-3 py-2.5 text-white">{CAT_ICON[exp.category] ?? "📦"} {exp.category}</td>
                            <td className="px-3 py-2.5" style={{ color: "#9ca3af" }}>{exp.description || <span style={{ color: "#374151" }}>—</span>}</td>
                            <td className="px-3 py-2.5 font-semibold" style={{ color: "#f59e0b" }}>{brl(Number(exp.amount))}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                <button onClick={() => startEdit(exp)}
                                  className="p-1.5 rounded-lg transition-all hover:bg-white/10 text-gray-400 hover:text-white" title="Editar">✏️</button>
                                <button onClick={() => deleteExpense(exp.id)}
                                  className="p-1.5 rounded-lg transition-all hover:bg-red-900/30 text-gray-500 hover:text-red-400" title="Excluir">🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#0f172a", borderTop: "1px solid #1f2937" }}>
                          <td colSpan={3} className="px-3 py-2.5 text-xs font-bold" style={{ color: "#9ca3af" }}>TOTAL DESPESAS</td>
                          <td className="px-3 py-2.5 text-sm font-black" style={{ color: "#f59e0b" }}>{brl(totalExpenses)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Resumo Financeiro */}
              {modalFinancials && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>📊 Resumo Financeiro</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Investimento Total", value: brl(modalFinancials.investimento), sub: "Compra + Despesas", color: "text-white" },
                      { label: "Lucro / Prejuízo",
                        value: modalFinancials.lucro != null ? brl(modalFinancials.lucro) : "—",
                        sub: modalFinancials.lucro == null ? "Informe valor de venda" : modalFinancials.lucro >= 0 ? "Lucro" : "Prejuízo",
                        color: modalFinancials.lucro == null ? "text-gray-500" : modalFinancials.lucro >= 0 ? "" : "" },
                      { label: "Margem",
                        value: modalFinancials.margem != null ? `${modalFinancials.margem.toFixed(1)}%` : "—",
                        sub: "sobre venda",
                        color: "" },
                    ].map((item, idx) => (
                      <div key={idx} className="rounded-xl p-3 text-center" style={{ background: "#111827" }}>
                        <p className="text-[10px] mb-1" style={{ color: "#6b7280" }}>{item.label}</p>
                        <p className="text-base font-black" style={{
                          color: idx === 0 ? "#fff"
                            : idx === 1 ? (modalFinancials.lucro == null ? "#6b7280" : modalFinancials.lucro >= 0 ? "#10b981" : "#ef4444")
                            : (modalFinancials.margem == null ? "#6b7280" : modalFinancials.margem >= 0 ? "#10b981" : "#ef4444")
                        }}>{item.value}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#374151" }}>{item.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
