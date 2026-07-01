"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

/* ── Types ─────────────────────────────────────────────────────────── */
type VehicleSnap = {
  id: string; brand: string; model: string; year?: string;
  plate?: string; color?: string; km?: number;
  chassis?: string; renavam?: string; photos?: string[]; status?: string;
};

type Sale = {
  id: string;
  vehicle_id: string;
  store_id?: string;
  buyer_name: string;
  buyer_cpf?: string;
  buyer_phone?: string;
  buyer_address?: string;
  buyer_cep?: string;
  payment_method: string;
  total_value: number;
  down_payment?: number;
  installments_count?: number;
  installment_value?: number;
  closing_date: string;
  status: string;
  notes?: string;
  created_at: string;
  vehicle?: VehicleSnap | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  cancellation_notes?: string | null;
};

type StockVehicle = {
  id: string; brand: string; model: string; year?: number; plate?: string; status?: string;
};

/* ── Constants ─────────────────────────────────────────────────────── */
const PAYMENT_LABEL: Record<string, string> = {
  avista:              "À Vista",
  financiado:          "Financiado",
  consorcio:           "Consórcio",
  leasing:             "Leasing",
  parcelado:           "Parcelado",
  cartao_credito:      "Cartão de Crédito",
  troca:               "Permuta / Troca",
  troca_financiado:    "Permuta + Financiamento",
  troca_consorcio:     "Permuta + Consórcio",
  outros:              "Outros",
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pago:      { label: "Pago",      color: "#10b981", bg: "#10b98122" },
  parcelado: { label: "Parcelado", color: "#f59e0b", bg: "#f59e0b22" },
  pendente:  { label: "Pendente",  color: "#ef4444", bg: "#ef444422" },
  cancelada: { label: "Cancelada", color: "#64748b", bg: "#64748b22" },
};

const CANCEL_REASON_LABEL: Record<string, string> = {
  financiamento_reprovado: "Financiamento Reprovado",
  desistencia_cliente:     "Desistência do Cliente",
  problema_veiculo:        "Problema no Veículo",
  erro_negociacao:         "Erro de Negociação",
  outro:                   "Outro",
};

const EMPTY_FORM = {
  vehicle_id: "", buyer_name: "", buyer_cpf: "", buyer_phone: "",
  buyer_cep: "", buyer_address: "", payment_method: "avista", total_value: "",
  down_payment: "", installments_count: "1", installment_value: "",
  closing_date: new Date().toISOString().split("T")[0],
  status: "pago", notes: "",
};

/* ── Helpers ────────────────────────────────────────────────────────── */
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
function vehicleLabel(v?: VehicleSnap | null) {
  if (!v) return "Veículo removido";
  return `${v.brand} ${v.model}${v.year ? " " + v.year : ""}${v.plate ? " · " + v.plate : ""}`;
}
function fmtCep(cep: string) {
  const d = cep.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
async function buscarEnderecoPorCep(cep: string): Promise<string | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const d = await res.json();
    if (d.erro) return null;
    return [
      [d.logradouro, d.bairro].filter(Boolean).join(", "),
      [d.localidade, d.uf].filter(Boolean).join(" - "),
    ].filter(Boolean).join(" · ");
  } catch {
    return null;
  }
}

/* ── Receipt PDF ────────────────────────────────────────────────────── */
function printReceipt(sale: Sale, storeName: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const v = sale.vehicle;
  const isParc = ["parcelado", "financiado", "consorcio", "leasing", "troca_financiado", "troca_consorcio", "cartao_credito"].includes(sale.payment_method) && (sale.installments_count ?? 1) > 1;

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Recibo de Venda — ${storeName}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:40px;color:#1a1a1a;font-size:13px}
      .header{text-align:center;border-bottom:3px solid #c1121f;padding-bottom:16px;margin-bottom:24px}
      .header h1{font-size:22px;color:#c1121f;font-weight:800}
      .header .subtitle{font-size:12px;color:#666;margin-top:4px}
      .recibo-num{font-size:11px;color:#888;margin-top:6px}
      .section{margin-bottom:20px}
      .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:10px}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
      .field .label{font-size:10px;color:#999;margin-bottom:2px}
      .field .value{font-size:13px;font-weight:600;color:#1a1a1a}
      .highlight-box{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:14px;margin-bottom:20px}
      .total-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:2px solid #c1121f;margin-top:10px}
      .total-row .label{font-size:14px;font-weight:700}
      .total-row .value{font-size:20px;font-weight:800;color:#c1121f}
      .signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:50px}
      .sig-line{border-top:1px solid #1a1a1a;padding-top:6px;text-align:center;font-size:11px;color:#555}
      .footer{text-align:center;margin-top:30px;font-size:10px;color:#bbb;border-top:1px solid #eee;padding-top:12px}
      @media print{body{padding:20px}}
    </style>
  </head><body>
    <div class="header">
      <h1>🤝 ${storeName}</h1>
      <div class="subtitle">Recibo de Compra e Venda de Veículo</div>
      <div class="recibo-num">Nº ${sale.id.slice(0, 8).toUpperCase()} · Emitido em ${new Date().toLocaleDateString("pt-BR")}</div>
    </div>

    <div class="section">
      <div class="section-title">📦 Dados do Veículo</div>
      <div class="grid3">
        <div class="field"><div class="label">Veículo</div><div class="value">${v?.brand ?? "-"} ${v?.model ?? ""}</div></div>
        <div class="field"><div class="label">Ano</div><div class="value">${v?.year ?? "-"}</div></div>
        <div class="field"><div class="label">Cor</div><div class="value">${v?.color ?? "-"}</div></div>
        <div class="field"><div class="label">Placa</div><div class="value">${v?.plate ?? "-"}</div></div>
        <div class="field"><div class="label">KM</div><div class="value">${v?.km != null ? v.km.toLocaleString("pt-BR") + " km" : "-"}</div></div>
        <div class="field"><div class="label">Chassi</div><div class="value">${v?.chassis ?? "-"}</div></div>
        <div class="field"><div class="label">RENAVAM</div><div class="value">${v?.renavam ?? "-"}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">👤 Dados do Comprador</div>
      <div class="grid2">
        <div class="field"><div class="label">Nome Completo</div><div class="value">${sale.buyer_name}</div></div>
        <div class="field"><div class="label">CPF / CNPJ</div><div class="value">${sale.buyer_cpf ?? "-"}</div></div>
        <div class="field"><div class="label">Telefone</div><div class="value">${sale.buyer_phone ?? "-"}</div></div>
        <div class="field"><div class="label">CEP</div><div class="value">${sale.buyer_cep ?? "-"}</div></div>
        <div class="field" style="grid-column:1/-1"><div class="label">Endereço</div><div class="value">${sale.buyer_address ?? "-"}</div></div>
      </div>
    </div>

    <div class="highlight-box">
      <div class="section-title">💰 Condições de Pagamento</div>
      <div class="grid3" style="margin-bottom:10px">
        <div class="field"><div class="label">Forma de Pagamento</div><div class="value">${PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}</div></div>
        <div class="field"><div class="label">Data de Fechamento</div><div class="value">${fmtDate(sale.closing_date)}</div></div>
        <div class="field"><div class="label">Status</div><div class="value">${STATUS_CFG[sale.status]?.label ?? sale.status}</div></div>
        ${sale.down_payment ? `<div class="field"><div class="label">Entrada</div><div class="value">${brl(Number(sale.down_payment))}</div></div>` : ""}
        ${isParc ? `<div class="field"><div class="label">Parcelas</div><div class="value">${sale.installments_count}x de ${sale.installment_value ? brl(Number(sale.installment_value)) : "-"}</div></div>` : ""}
      </div>
      <div class="total-row">
        <span class="label">VALOR TOTAL DA VENDA</span>
        <span class="value">${brl(Number(sale.total_value))}</span>
      </div>
    </div>

    ${sale.notes ? `<div class="section"><div class="section-title">📝 Observações</div><p style="font-size:12px;color:#555">${sale.notes}</p></div>` : ""}

    <div class="signatures">
      <div>
        <div class="sig-line">Assinatura do Vendedor / ${storeName}</div>
      </div>
      <div>
        <div class="sig-line">Assinatura do Comprador / ${sale.buyer_name}</div>
      </div>
    </div>

    <div class="footer">
      Documento gerado pelo CRM 7Business · ${new Date().toLocaleString("pt-BR")} · ${storeName}
    </div>
  </body></html>`);
  win.document.close();
  win.print();
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════ */
export default function VendasPage() {
  const [userId, setUserId]       = useState<string | null>(null);
  const [storeName, setStoreName] = useState("CRM 7Business");
  const [sales, setSales]         = useState<Sale[]>([]);
  const [stock, setStock]         = useState<StockVehicle[]>([]);
  const [loading, setLoading]     = useState(true);

  // tabs
  const [activeTab, setActiveTab] = useState<"vendas" | "cancelamentos">("vendas");

  // filters
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterPayment, setFilterPayment] = useState("todos");
  const [filterReason, setFilterReason] = useState("todos");

  // modals
  const [showNew, setShowNew]   = useState(false);
  const [detail, setDetail]     = useState<Sale | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Sale>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);
  const [sortCol, setSortCol]   = useState<keyof Sale>("closing_date");
  const [sortAsc, setSortAsc]   = useState(false);

  // cancelamento
  const [showCancel, setShowCancel]           = useState(false);
  const [cancelReason, setCancelReason]       = useState("");
  const [cancelNotes, setCancelNotes]         = useState("");
  const [cancelling, setCancelling]           = useState(false);

  // busca de CEP
  const [cepLoadingNew, setCepLoadingNew]   = useState(false);
  const [cepLoadingEdit, setCepLoadingEdit] = useState(false);

  async function handleCepChangeNew(rawCep: string) {
    const formatted = fmtCep(rawCep);
    setForm(f => ({ ...f, buyer_cep: formatted }));
    if (formatted.replace(/\D/g, "").length !== 8) return;
    setCepLoadingNew(true);
    const endereco = await buscarEnderecoPorCep(formatted);
    setCepLoadingNew(false);
    if (endereco) setForm(f => ({ ...f, buyer_address: endereco }));
  }

  async function handleCepChangeEdit(rawCep: string) {
    const formatted = fmtCep(rawCep);
    setEditForm(prev => ({ ...prev, buyer_cep: formatted }));
    if (formatted.replace(/\D/g, "").length !== 8) return;
    setCepLoadingEdit(true);
    const endereco = await buscarEnderecoPorCep(formatted);
    setCepLoadingEdit(false);
    if (endereco) setEditForm(prev => ({ ...prev, buyer_address: endereco }));
  }

  /* ── auth ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      fetch(`/api/settings?userId=${data.user.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.business_name) setStoreName(d.business_name); })
        .catch(() => {});
    });
  }, []);

  /* ── fetch sales ── */
  const fetchSales = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/vendas");
    if (res.ok) setSales(await res.json());
    setLoading(false);
  }, []);

  /* ── fetch stock (for new sale modal) — inclui vendidos para cadastro retroativo ── */
  const fetchStock = useCallback(async () => {
    const res = await fetch("/api/inventory");
    if (res.ok) {
      const data = await res.json();
      // Mostra TODOS os veículos; vendidos aparecem com indicador para cadastro retroativo
      setStock(data);
    }
  }, []);

  useEffect(() => { fetchSales(); fetchStock(); }, [fetchSales, fetchStock]);

  /* ── filtered + sorted ── */
  const filtered = useMemo(() => {
    const base = activeTab === "cancelamentos"
      ? sales.filter(s => s.status === "cancelada")
      : sales.filter(s => s.status !== "cancelada");

    return base
      .filter(s => {
        if (activeTab === "vendas") {
          if (filterStatus  !== "todos" && s.status         !== filterStatus)  return false;
          if (filterPayment !== "todos" && s.payment_method !== filterPayment) return false;
        } else {
          if (filterReason !== "todos" && s.cancellation_reason !== filterReason) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const vLabel = vehicleLabel(s.vehicle).toLowerCase();
          return (
            (s.buyer_name ?? "").toLowerCase().includes(q) ||
            (s.buyer_phone ?? "").includes(q) ||
            vLabel.includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        return sortAsc
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
  }, [sales, activeTab, filterStatus, filterPayment, filterReason, search, sortCol, sortAsc]);

  /* ── indicador global de cancelamento (independe da aba) ── */
  const cancelStats = useMemo(() => {
    const total = sales.length;
    const cancelled = sales.filter(s => s.status === "cancelada").length;
    return { cancelled, rate: total > 0 ? (cancelled / total) * 100 : 0 };
  }, [sales]);

  function toggleSort(col: keyof Sale) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
  }

  function SortTh({ col, children }: { col: keyof Sale; children: React.ReactNode }) {
    const active = sortCol === col;
    return (
      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
        style={{ color: active ? "#f87171" : "#6b7280" }}
        onClick={() => toggleSort(col)}>
        {children} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  /* ── nova venda ── */
  function openDetail(sale: Sale) {
    setDetail(sale);
    setEditMode(sale.status !== "cancelada");
    setShowCancel(false);
    setCancelReason("");
    setCancelNotes("");
    setEditForm({
      buyer_name: sale.buyer_name,
      buyer_cpf: sale.buyer_cpf ?? "",
      buyer_phone: sale.buyer_phone ?? "",
      buyer_cep: sale.buyer_cep ?? "",
      buyer_address: sale.buyer_address ?? "",
      payment_method: sale.payment_method,
      total_value: sale.total_value,
      down_payment: sale.down_payment ?? 0,
      installments_count: sale.installments_count ?? 1,
      installment_value: sale.installment_value ?? undefined,
      closing_date: sale.closing_date,
      status: sale.status,
      notes: sale.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!detail) return;
    setSavingEdit(true);
    const res = await fetch("/api/vendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.id, ...editForm }),
    });
    setSavingEdit(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      alert(`Erro ao salvar: ${err.error}`);
      return;
    }
    const updated: Sale = await res.json();
    // Preserve vehicle join data
    const updatedWithVehicle: Sale = { ...updated, vehicle: detail.vehicle };
    setDetail(updatedWithVehicle);
    setSales(prev => prev.map(s => s.id === detail.id ? updatedWithVehicle : s));
  }

  async function handleCancelSale() {
    if (!detail || !cancelReason) return;
    setCancelling(true);
    const res = await fetch("/api/vendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: detail.id,
        status: "cancelada",
        cancellation_reason: cancelReason,
        cancellation_notes: cancelNotes,
      }),
    });
    setCancelling(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      alert(`Erro ao cancelar: ${err.error}`);
      return;
    }
    const updated: Sale = await res.json();
    const updatedWithVehicle: Sale = { ...updated, vehicle: detail.vehicle };
    setDetail(updatedWithVehicle);
    setSales(prev => prev.map(s => s.id === detail.id ? updatedWithVehicle : s));
    setEditMode(false);
    setShowCancel(false);
    fetchStock();
  }

  async function handleNewSale(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_id || !form.buyer_name || !form.total_value) return;
    setSaving(true);
    const res = await fetch("/api/vendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, store_id: userId }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      alert(`Erro: ${err.error}`);
      return;
    }
    setShowNew(false);
    setForm({ ...EMPTY_FORM });
    await fetchSales();
    fetchStock();
  }

  /* ── totais resumo ── */
  const totals = useMemo(() => ({
    count:    filtered.length,
    total:    filtered.reduce((s, v) => s + Number(v.total_value), 0),
    pagos:    filtered.filter(v => v.status === "pago").length,
    pendente: filtered.filter(v => v.status !== "pago").length,
  }), [filtered]);

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-screen overflow-y-auto" style={{ background: "#0f172a" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">🤝 Vendas</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
              {storeName} · Histórico completo de vendas
            </p>
          </div>
          <button onClick={() => { setShowNew(true); setForm({ ...EMPTY_FORM }); }}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: "#e63946" }}>
            + Nova Venda
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: "#1f2937" }}>
          {[
            { key: "vendas" as const,       label: "🤝 Vendas" },
            { key: "cancelamentos" as const, label: "❌ Cancelamentos" },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px"
              style={{
                color: activeTab === t.key ? "#ffffff" : "#6b7280",
                borderColor: activeTab === t.key ? "#e63946" : "transparent",
              }}>
              {t.label}
              {t.key === "cancelamentos" && cancelStats.cancelled > 0 && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#64748b22", color: "#94a3b8" }}>
                  {cancelStats.cancelled}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(activeTab === "vendas" ? [
            { label: "Total de Vendas",  value: totals.count.toString(),  color: "#3b82f6", icon: "🤝" },
            { label: "Receita Total",     value: brl(totals.total),        color: "#10b981", icon: "💰" },
            { label: "Pagas",            value: totals.pagos.toString(),   color: "#10b981", icon: "✅" },
            { label: "Taxa de Cancelamento", value: `${cancelStats.rate.toFixed(1)}%`, color: "#64748b", icon: "❌" },
          ] : [
            { label: "Total Cancelado",      value: totals.count.toString(), color: "#64748b", icon: "❌" },
            { label: "Valor Perdido",        value: brl(totals.total),       color: "#ef4444", icon: "💸" },
            { label: "Taxa de Cancelamento", value: `${cancelStats.rate.toFixed(1)}%`, color: "#64748b", icon: "📉" },
            { label: "Total Geral de Vendas", value: sales.length.toString(), color: "#3b82f6", icon: "🤝" },
          ]).map(c => (
            <div key={c.label} className="rounded-2xl p-4" style={{ background: "#111827", border: "1px solid #1f2937" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>{c.icon} {c.label}</p>
              <p className="text-xl font-black" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input placeholder="Buscar comprador, veículo, telefone..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 border focus:outline-none focus:border-red-500"
            style={{ background: "#111827", borderColor: "#1f2937" }} />
          {activeTab === "vendas" ? <>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none"
              style={{ background: "#111827", borderColor: "#1f2937" }}>
              <option value="todos">Todos os status</option>
              <option value="pago">Pago</option>
              <option value="parcelado">Parcelado</option>
              <option value="pendente">Pendente</option>
            </select>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
              className="rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none"
              style={{ background: "#111827", borderColor: "#1f2937" }}>
              <option value="todos">Todos os pagamentos</option>
              <option value="avista">À Vista</option>
              <option value="financiado">Financiado</option>
              <option value="parcelado">Parcelado</option>
              <option value="troca">Troca</option>
            </select>
          </> : (
            <select value={filterReason} onChange={e => setFilterReason(e.target.value)}
              className="rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none"
              style={{ background: "#111827", borderColor: "#1f2937" }}>
              <option value="todos">Todos os motivos</option>
              {Object.entries(CANCEL_REASON_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid #1f2937" }}>
          {loading ? (
            <div className="py-16 text-center text-gray-500">Carregando vendas...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center" style={{ color: "#6b7280" }}>
              <p className="text-4xl mb-3">{activeTab === "cancelamentos" ? "❌" : "🤝"}</p>
              <p className="font-semibold">
                {activeTab === "cancelamentos" ? "Nenhuma venda cancelada" : "Nenhuma venda encontrada"}
              </p>
              <p className="text-sm mt-1">
                {activeTab === "cancelamentos" ? "Vendas canceladas aparecerão aqui" : 'Clique em "+ Nova Venda" para registrar'}
              </p>
            </div>
          ) : activeTab === "cancelamentos" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1f2937" }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Veículo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Comprador</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Data Cancelamento</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Motivo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Valor</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={s.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid #1f2937", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(230,57,70,0.07)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"}
                      onClick={() => openDetail(s)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {s.vehicle?.photos?.[0]
                            ? <img src={s.vehicle.photos[0]} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" />
                            : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: "#1f2937" }}>🚗</div>}
                          <div>
                            <p className="font-semibold text-white text-xs leading-tight">
                              {s.vehicle ? `${s.vehicle.brand} ${s.vehicle.model}` : "—"}
                            </p>
                            <p className="text-[10px]" style={{ color: "#6b7280" }}>
                              {[s.vehicle?.year, s.vehicle?.plate].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{s.buyer_name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>
                        {s.cancelled_at ? new Date(s.cancelled_at).toLocaleDateString("pt-BR") : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#64748b22", color: "#94a3b8" }}>
                          {CANCEL_REASON_LABEL[s.cancellation_reason ?? ""] ?? s.cancellation_reason ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-black" style={{ color: "#ef4444" }}>{brl(Number(s.total_value))}</td>
                      <td className="px-4 py-3">
                        <button onClick={e => { e.stopPropagation(); openDetail(s); }}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                          style={{ background: "#1f2937", color: "#9ca3af" }}>
                          Ver detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1f2937" }}>
                    <SortTh col="vehicle_id">Veículo</SortTh>
                    <SortTh col="buyer_name">Comprador</SortTh>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Telefone</th>
                    <SortTh col="closing_date">Fechamento</SortTh>
                    <SortTh col="payment_method">Pagamento</SortTh>
                    <SortTh col="total_value">Valor Total</SortTh>
                    <SortTh col="status">Status</SortTh>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const cfg = STATUS_CFG[s.status];
                    return (
                      <tr key={s.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid #1f2937", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(230,57,70,0.07)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"}
                        onClick={() => openDetail(s)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {s.vehicle?.photos?.[0]
                              ? <img src={s.vehicle.photos[0]} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" />
                              : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: "#1f2937" }}>🚗</div>}
                            <div>
                              <p className="font-semibold text-white text-xs leading-tight">
                                {s.vehicle ? `${s.vehicle.brand} ${s.vehicle.model}` : "—"}
                              </p>
                              <p className="text-[10px]" style={{ color: "#6b7280" }}>
                                {[s.vehicle?.year, s.vehicle?.plate].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-white">{s.buyer_name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{s.buyer_phone ?? "-"}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{fmtDate(s.closing_date)}</td>
                        <td className="px-4 py-3 text-xs text-white">{PAYMENT_LABEL[s.payment_method] ?? s.payment_method}</td>
                        <td className="px-4 py-3 text-sm font-black" style={{ color: "#10b981" }}>{brl(Number(s.total_value))}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: cfg?.bg ?? "#6b728022", color: cfg?.color ?? "#6b7280" }}>
                            {cfg?.label ?? s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={e => { e.stopPropagation(); openDetail(s); }}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                            style={{ background: "#1f2937", color: "#9ca3af" }}>
                            Ver detalhes
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL NOVA VENDA ═══ */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>

            <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ background: "#111827", borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-lg font-black text-white">+ Nova Venda</h2>
              <button onClick={() => setShowNew(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                style={{ background: "#1f2937" }}>✕</button>
            </div>

            <form onSubmit={handleNewSale} className="px-6 py-5 space-y-5">

              {/* Veículo */}
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>🚗 Veículo</p>
                <select required value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-red-500"
                  style={{ background: "#111827", borderColor: "#374151" }}>
                  <option value="">Selecionar veículo...</option>
                  {stock.map((v: StockVehicle & { status?: string }) => (
                    <option key={v.id} value={v.id}>
                      {v.status === "vendido" ? "✅ " : ""}{v.brand} {v.model}{v.year ? " " + v.year : ""}{v.plate ? " · " + v.plate : ""}{v.status === "vendido" ? " (já vendido)" : ""}
                    </option>
                  ))}
                </select>
                {stock.length === 0 && (
                  <p className="text-xs" style={{ color: "#f59e0b" }}>⚠️ Nenhum veículo cadastrado no estoque</p>
                )}
              </div>

              {/* Comprador */}
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>👤 Comprador</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Nome Completo *", key: "buyer_name", required: true, placeholder: "Ex: João da Silva" },
                    { label: "CPF / CNPJ",       key: "buyer_cpf",  required: false, placeholder: "000.000.000-00" },
                    { label: "Telefone",          key: "buyer_phone",required: false, placeholder: "(85) 99999-0000" },
                  ].map(({ label, key, required, placeholder }) => (
                    <div key={key}>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>{label}</label>
                      <input type="text" required={required} placeholder={placeholder}
                        value={(form as Record<string, string>)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                        style={{ background: "#111827", borderColor: "#374151" }} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                      CEP {cepLoadingNew && <span style={{ color: "#f59e0b" }}>· buscando...</span>}
                    </label>
                    <input type="text" placeholder="00000-000" maxLength={9}
                      value={form.buyer_cep}
                      onChange={e => handleCepChangeNew(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                      style={{ background: "#111827", borderColor: "#374151" }} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Endereço</label>
                    <input type="text" placeholder="Rua, número, bairro..."
                      value={form.buyer_address}
                      onChange={e => setForm(f => ({ ...f, buyer_address: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                      style={{ background: "#111827", borderColor: "#374151" }} />
                  </div>
                </div>
              </div>

              {/* Pagamento */}
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>💰 Pagamento</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Forma de Pagamento *</label>
                    <select required value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={{ background: "#111827", borderColor: "#374151" }}>
                      <option value="avista">À Vista</option>
                      <option value="financiado">Financiado</option>
                      <option value="consorcio">Consórcio</option>
                      <option value="leasing">Leasing</option>
                      <option value="parcelado">Parcelado</option>
                      <option value="cartao_credito">Cartão de Crédito</option>
                      <option value="troca">Permuta / Troca</option>
                      <option value="troca_financiado">Permuta + Financiamento</option>
                      <option value="troca_consorcio">Permuta + Consórcio</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor Total (R$) *</label>
                    <input type="number" step="0.01" required placeholder="Ex: 52000.00"
                      value={form.total_value} onChange={e => setForm(f => ({ ...f, total_value: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={{ background: "#111827", borderColor: "#374151" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Entrada (R$)</label>
                    <input type="number" step="0.01" placeholder="0.00"
                      value={form.down_payment} onChange={e => setForm(f => ({ ...f, down_payment: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={{ background: "#111827", borderColor: "#374151" }} />
                  </div>
                  {(["parcelado", "financiado", "consorcio", "leasing", "troca_financiado", "troca_consorcio", "cartao_credito"].includes(form.payment_method)) && <>
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                        Nº Parcelas {form.payment_method === "cartao_credito" && <span style={{ color: "#f59e0b" }}>💳 até 24x</span>}
                      </label>
                      {form.payment_method === "cartao_credito" ? (
                        <select value={form.installments_count}
                          onChange={e => {
                            const n = Number(e.target.value);
                            const saldo = Number(form.total_value) - Number(form.down_payment || 0);
                            const parcela = n > 0 && saldo > 0 ? (saldo / n).toFixed(2) : "";
                            setForm(f => ({ ...f, installments_count: String(n), installment_value: parcela }));
                          }}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }}>
                          {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}x</option>
                          ))}
                        </select>
                      ) : (
                        <input type="number" min="1" value={form.installments_count}
                          onChange={e => setForm(f => ({ ...f, installments_count: e.target.value }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor Parcela (R$)</label>
                      <input type="number" step="0.01" placeholder="0.00"
                        value={form.installment_value} onChange={e => setForm(f => ({ ...f, installment_value: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                        style={{ background: "#111827", borderColor: "#374151" }} />
                    </div>
                  </>}
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data de Fechamento</label>
                    <input type="date" value={form.closing_date}
                      onChange={e => setForm(f => ({ ...f, closing_date: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={{ background: "#111827", borderColor: "#374151", colorScheme: "dark" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={{ background: "#111827", borderColor: "#374151" }}>
                      <option value="pago">Pago</option>
                      <option value="parcelado">Parcelado</option>
                      <option value="pendente">Pendente</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Observações</label>
                  <textarea rows={2} placeholder="Observações sobre a venda..."
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none resize-none"
                    style={{ background: "#111827", borderColor: "#374151" }} />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#e63946" }}>
                  {saving ? "Registrando…" : "✓ Registrar Venda"}
                </button>
                <button type="button" onClick={() => setShowNew(false)}
                  className="rounded-xl px-6 py-3 text-sm font-semibold transition-all"
                  style={{ background: "#1f2937", color: "#9ca3af" }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL DETALHES DA VENDA ═══ */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) { setDetail(null); setEditMode(false); } }}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ background: "#111827", borderBottom: "1px solid #1f2937" }}>
              <div>
                <h2 className="text-lg font-black text-white">{vehicleLabel(detail.vehicle)}</h2>
                <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                  Venda · {fmtDate(detail.closing_date)} · {PAYMENT_LABEL[detail.payment_method]}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                {detail.status !== "cancelada" && (
                  <button onClick={saveEdit} disabled={savingEdit}
                    className="rounded-xl px-4 py-2 text-sm font-bold text-white flex items-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: "#10b981" }}>
                    {savingEdit ? "Salvando…" : "✓ Salvar"}
                  </button>
                )}
                <button onClick={() => printReceipt(detail, storeName)}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white flex items-center gap-1.5 transition-all hover:opacity-90"
                  style={{ background: "#e63946" }}>
                  🖨️ Recibo
                </button>
                {detail.status !== "cancelada" && (
                  <button onClick={() => setShowCancel(true)}
                    className="rounded-xl px-4 py-2 text-sm font-bold text-white flex items-center gap-1.5 transition-all hover:opacity-90"
                    style={{ background: "#64748b" }}>
                    ❌ Cancelar Venda
                  </button>
                )}
                <button onClick={() => { setDetail(null); setEditMode(false); }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                  style={{ background: "#1f2937" }}>✕</button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Aviso de venda cancelada */}
              {detail.status === "cancelada" && (
                <div className="rounded-2xl p-4" style={{ background: "#64748b15", border: "1px solid #64748b30" }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#94a3b8" }}>❌ Venda Cancelada</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#6b7280" }}>Data do Cancelamento</p>
                      <p className="text-sm font-semibold text-white">
                        {detail.cancelled_at ? new Date(detail.cancelled_at).toLocaleString("pt-BR") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#6b7280" }}>Motivo</p>
                      <p className="text-sm font-semibold text-white">
                        {CANCEL_REASON_LABEL[detail.cancellation_reason ?? ""] ?? detail.cancellation_reason ?? "—"}
                      </p>
                    </div>
                    {detail.cancellation_notes && (
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#6b7280" }}>Observação</p>
                        <p className="text-sm" style={{ color: "#d1d5db" }}>{detail.cancellation_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dados do Veículo — sempre somente leitura */}
              <div className="rounded-2xl p-4" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>🚗 Dados do Veículo</p>
                {detail.vehicle?.photos?.[0] && (
                  <img src={detail.vehicle.photos[0]} alt="" className="w-full h-40 object-cover rounded-xl mb-3" />
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Marca / Modelo", value: detail.vehicle ? `${detail.vehicle.brand} ${detail.vehicle.model}` : "—" },
                    { label: "Ano",    value: detail.vehicle?.year   ?? "—" },
                    { label: "Cor",    value: detail.vehicle?.color  ?? "—" },
                    { label: "Placa",  value: detail.vehicle?.plate  ?? "—" },
                    { label: "KM",     value: detail.vehicle?.km != null ? detail.vehicle.km.toLocaleString("pt-BR") + " km" : "—" },
                    { label: "Chassi", value: detail.vehicle?.chassis ?? "—" },
                    { label: "RENAVAM",value: detail.vehicle?.renavam ?? "—" },
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#6b7280" }}>{f.label}</p>
                      <p className="text-sm font-semibold text-white">{String(f.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dados do Comprador */}
              <div className="rounded-2xl p-4" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>👤 Comprador</p>
                {editMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { key: "buyer_name",    label: "Nome *",     type: "text" },
                      { key: "buyer_cpf",     label: "CPF/CNPJ",   type: "text" },
                      { key: "buyer_phone",   label: "Telefone",   type: "text" },
                    ] as { key: keyof typeof editForm; label: string; type: string }[]).map(f => (
                      <div key={f.key}>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>{f.label}</label>
                        <input type={f.type} value={String(editForm[f.key] ?? "")}
                          onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                    ))}
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                        CEP {cepLoadingEdit && <span style={{ color: "#f59e0b" }}>· buscando...</span>}
                      </label>
                      <input type="text" placeholder="00000-000" maxLength={9}
                        value={String(editForm.buyer_cep ?? "")}
                        onChange={e => handleCepChangeEdit(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                        style={{ background: "#111827", borderColor: "#374151" }} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Endereço</label>
                      <input type="text" value={String(editForm.buyer_address ?? "")}
                        onChange={e => setEditForm(prev => ({ ...prev, buyer_address: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                        style={{ background: "#111827", borderColor: "#374151" }} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Nome",     value: detail.buyer_name },
                      { label: "CPF/CNPJ",  value: detail.buyer_cpf    ?? "—" },
                      { label: "Telefone",  value: detail.buyer_phone   ?? "—" },
                      { label: "CEP",       value: detail.buyer_cep     ?? "—" },
                      { label: "Endereço",  value: detail.buyer_address ?? "—" },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#6b7280" }}>{f.label}</p>
                        <p className="text-sm font-semibold text-white">{f.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagamento */}
              <div className="rounded-2xl p-4" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>💰 Pagamento</p>
                {editMode ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Forma de Pagamento</label>
                        <select value={editForm.payment_method ?? "avista"}
                          onChange={e => setEditForm(prev => ({ ...prev, payment_method: e.target.value }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }}>
                          <option value="avista">À Vista</option>
                          <option value="financiado">Financiado</option>
                          <option value="consorcio">Consórcio</option>
                          <option value="leasing">Leasing</option>
                          <option value="parcelado">Parcelado</option>
                          <option value="cartao_credito">Cartão de Crédito</option>
                          <option value="troca">Permuta / Troca</option>
                          <option value="troca_financiado">Permuta + Financiamento</option>
                          <option value="troca_consorcio">Permuta + Consórcio</option>
                          <option value="outros">Outros</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data Fechamento</label>
                        <input type="date" value={String(editForm.closing_date ?? "")}
                          onChange={e => setEditForm(prev => ({ ...prev, closing_date: e.target.value }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor Total (R$)</label>
                        <input type="number" min="0" step="0.01" value={String(editForm.total_value ?? "")}
                          onChange={e => setEditForm(prev => ({ ...prev, total_value: Number(e.target.value) }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Entrada (R$)</label>
                        <input type="number" min="0" step="0.01" value={String(editForm.down_payment ?? "")}
                          onChange={e => setEditForm(prev => ({ ...prev, down_payment: Number(e.target.value) }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                          Nº Parcelas {editForm.payment_method === "cartao_credito" && <span style={{ color: "#f59e0b" }}>💳 até 24x</span>}
                        </label>
                        {editForm.payment_method === "cartao_credito" ? (
                          <select value={String(editForm.installments_count ?? 1)}
                            onChange={e => {
                              const n = Number(e.target.value);
                              const saldo = Number(editForm.total_value ?? 0) - Number(editForm.down_payment ?? 0);
                              const parcela = n > 0 && saldo > 0 ? saldo / n : editForm.installment_value;
                              setEditForm(prev => ({ ...prev, installments_count: n, installment_value: Number(parcela) }));
                            }}
                            className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                            style={{ background: "#111827", borderColor: "#374151" }}>
                            {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n}x</option>
                            ))}
                          </select>
                        ) : (
                          <input type="number" min="1" value={String(editForm.installments_count ?? 1)}
                            onChange={e => setEditForm(prev => ({ ...prev, installments_count: Number(e.target.value) }))}
                            className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                            style={{ background: "#111827", borderColor: "#374151" }} />
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor/Parcela (R$)</label>
                        <input type="number" min="0" step="0.01" value={String(editForm.installment_value ?? "")}
                          onChange={e => setEditForm(prev => ({ ...prev, installment_value: Number(e.target.value) }))}
                          className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                          style={{ background: "#111827", borderColor: "#374151" }} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Status</label>
                      <select value={editForm.status ?? "pago"}
                        onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                        style={{ background: "#111827", borderColor: "#374151" }}>
                        <option value="pago">Pago</option>
                        <option value="parcelado">Parcelado</option>
                        <option value="pendente">Pendente</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {[
                        { label: "Forma",          value: PAYMENT_LABEL[detail.payment_method] ?? detail.payment_method },
                        { label: "Fechamento",     value: fmtDate(detail.closing_date) },
                        { label: "Entrada",        value: detail.down_payment ? brl(Number(detail.down_payment)) : "—" },
                        ...(detail.installments_count && detail.installments_count > 1 ? [
                          { label: "Parcelas",      value: `${detail.installments_count}x` },
                          { label: "Valor/Parcela", value: detail.installment_value ? brl(Number(detail.installment_value)) : "—" },
                          { label: "Saldo Devedor", value: brl(Number(detail.total_value) - Number(detail.down_payment ?? 0)) },
                        ] : []),
                      ].map(f => (
                        <div key={f.label}>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#6b7280" }}>{f.label}</p>
                          <p className="text-sm font-semibold text-white">{f.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{ background: "#10b98115", border: "1px solid #10b98130" }}>
                      <span className="text-sm font-bold text-white">Valor Total da Venda</span>
                      <span className="text-xl font-black" style={{ color: "#10b981" }}>{brl(Number(detail.total_value))}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: "#6b7280" }}>Status:</span>
                      <span className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: STATUS_CFG[detail.status]?.bg ?? "#6b728022", color: STATUS_CFG[detail.status]?.color ?? "#6b7280" }}>
                        {STATUS_CFG[detail.status]?.label ?? detail.status}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Observações */}
              <div className="rounded-2xl p-4" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#6b7280" }}>📝 Observações</p>
                {editMode ? (
                  <textarea rows={3} placeholder="Observações sobre a venda..."
                    value={String(editForm.notes ?? "")}
                    onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none resize-none"
                    style={{ background: "#111827", borderColor: "#374151" }} />
                ) : (
                  <p className="text-sm" style={{ color: "#9ca3af" }}>{detail.notes || "—"}</p>
                )}
              </div>

              {/* Histórico */}
              <div className="rounded-2xl p-4" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>🕐 Histórico</p>
                <div className="space-y-2">
                  {[
                    { icon: "✅", label: "Venda registrada",              date: detail.created_at },
                    { icon: "🚗", label: "Veículo marcado como vendido",  date: detail.closing_date },
                    ...(detail.status === "cancelada" ? [{
                      icon: "❌",
                      label: `Venda cancelada — ${CANCEL_REASON_LABEL[detail.cancellation_reason ?? ""] ?? detail.cancellation_reason}`,
                      date: detail.cancelled_at ?? detail.created_at,
                    }] : []),
                  ].map((ev, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span>{ev.icon}</span>
                      <span className="flex-1" style={{ color: "#9ca3af" }}>{ev.label}</span>
                      <span style={{ color: "#6b7280" }}>{fmtDate(ev.date?.slice(0, 10) ?? "")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botão recibo */}
              <button onClick={() => printReceipt(detail, storeName)}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "#e63946" }}>
                🖨️ Visualizar e Imprimir Recibo em PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CONFIRMAR CANCELAMENTO ═══ */}
      {showCancel && detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowCancel(false); }}>
          <div className="w-full max-w-md rounded-2xl"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="px-6 py-4" style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-lg font-black text-white">❌ Cancelar Venda</h2>
              <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                {vehicleLabel(detail.vehicle)} · {detail.buyer_name}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl p-3 text-xs" style={{ background: "#ef444415", border: "1px solid #ef444430", color: "#fca5a5" }}>
                Esta ação não pode ser desfeita. O veículo voltará automaticamente para o estoque como <b>Disponível</b>.
              </div>

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Motivo do Cancelamento *</label>
                <select required value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                  style={{ background: "#0f172a", borderColor: "#374151" }}>
                  <option value="">Selecionar motivo...</option>
                  {Object.entries(CANCEL_REASON_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Observação</label>
                <textarea rows={3} placeholder="Detalhes adicionais sobre o cancelamento..."
                  value={cancelNotes} onChange={e => setCancelNotes(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none resize-none"
                  style={{ background: "#0f172a", borderColor: "#374151" }} />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={handleCancelSale} disabled={!cancelReason || cancelling}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#64748b" }}>
                  {cancelling ? "Cancelando…" : "Confirmar Cancelamento"}
                </button>
                <button type="button" onClick={() => setShowCancel(false)}
                  className="rounded-xl px-6 py-3 text-sm font-semibold transition-all"
                  style={{ background: "#1f2937", color: "#9ca3af" }}>
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
