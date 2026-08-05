"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import * as XLSX from "xlsx";

const supabase = getSupabaseBrowser();

/* ── Types ─────────────────────────────────────────────────────────── */
type BankReturn = {
  id: string;
  store_id: string;
  sale_id: string | null;
  banco: string | null;
  proposta: string | null;
  cliente: string | null;
  veiculo: string | null;
  data_credito: string | null;
  valor_recebido: number | null;
  tipo: "comissao" | "rebate" | "incentivo" | "bonificacao" | null;
  observacoes: string | null;
  vendedor: string | null;
  status: "aguardando_retorno" | "recebido" | "faturado" | "cancelado";
  fluxo_caixa_entry_id: string | null;
  created_at: string;
};

/* ── Constants ─────────────────────────────────────────────────────── */
const BANCOS_SUGERIDOS = ["BV", "Santander", "Itaú", "C6 Bank", "Safra", "Bradesco", "Banco do Brasil", "Caixa Econômica", "Sicoob", "Sicredi"];

const TIPOS = [
  { value: "comissao",    label: "Comissão" },
  { value: "rebate",      label: "Rebate" },
  { value: "incentivo",   label: "Incentivo" },
  { value: "bonificacao", label: "Bonificação" },
] as const;
const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.value, t.label]));

const STATUS_LABEL: Record<string, string> = {
  aguardando_retorno: "Aguardando Retorno",
  recebido: "Recebido",
  faturado: "Faturado",
  cancelado: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  aguardando_retorno: "#3b82f6",
  recebido: "#10b981",
  faturado: "#8b5cf6",
  cancelado: "#6b7280",
};

const EMPTY_FORM = {
  banco: "", proposta: "", cliente: "", veiculo: "",
  data_credito: new Date().toISOString().split("T")[0],
  valor_recebido: "", tipo: "comissao" as (typeof TIPOS)[number]["value"],
  observacoes: "", vendedor: "",
  status: "recebido" as BankReturn["status"],
};

/* ── Helpers ───────────────────────────────────────────────────────── */
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
function effectiveDate(r: BankReturn) {
  return r.data_credito ?? r.created_at.slice(0, 10);
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
}

/* ── Exportações ───────────────────────────────────────────────────── */
function reportRows(returns: BankReturn[]) {
  return returns
    .filter(r => r.status === "recebido" || r.status === "faturado")
    .sort((a, b) => (a.data_credito ?? "").localeCompare(b.data_credito ?? ""));
}

function exportCSV(returns: BankReturn[], storeName: string) {
  const rows = reportRows(returns);
  const header = ["Mês", "Data do Crédito", "Banco", "Cliente", "Veículo", "Proposta", "Tipo", "Vendedor", "Valor Recebido (R$)"];
  const lines = [
    `"${storeName} - Retornos Bancários"`,
    "",
    header.join(";"),
    ...rows.map(r => [
      monthLabel(monthKey(r.data_credito ?? "")),
      fmtDate(r.data_credito),
      `"${(r.banco ?? "").replace(/"/g, '""')}"`,
      `"${(r.cliente ?? "").replace(/"/g, '""')}"`,
      `"${(r.veiculo ?? "").replace(/"/g, '""')}"`,
      `"${(r.proposta ?? "").replace(/"/g, '""')}"`,
      TIPO_LABEL[r.tipo ?? ""] ?? "",
      `"${(r.vendedor ?? "").replace(/"/g, '""')}"`,
      Number(r.valor_recebido ?? 0).toFixed(2).replace(".", ","),
    ].join(";")),
    "",
    ["\"TOTAL GERAL\"", "", "", "", "", "", "", "", rows.reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0).toFixed(2).replace(".", ",")].join(";"),
  ];
  const bom = "﻿";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `retornos-bancarios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportXLSX(returns: BankReturn[], storeName: string) {
  const rows = reportRows(returns);
  const data = rows.map(r => ({
    "Mês": monthLabel(monthKey(r.data_credito ?? "")),
    "Data do Crédito": fmtDate(r.data_credito),
    "Banco": r.banco ?? "",
    "Cliente": r.cliente ?? "",
    "Veículo": r.veiculo ?? "",
    "Proposta": r.proposta ?? "",
    "Tipo": TIPO_LABEL[r.tipo ?? ""] ?? "",
    "Vendedor": r.vendedor ?? "",
    "Valor Recebido (R$)": Number(r.valor_recebido ?? 0),
  }));
  data.push({
    "Mês": "", "Data do Crédito": "", "Banco": "", "Cliente": "", "Veículo": "", "Proposta": "", "Tipo": "", "Vendedor": "TOTAL GERAL",
    "Valor Recebido (R$)": rows.reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0),
  } as (typeof data)[number]);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Retornos Bancários");
  XLSX.writeFile(wb, `retornos-bancarios-${storeName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function printReport(
  returns: BankReturn[],
  storeName: string,
  filters: { dateFrom: string; dateTo: string; banco: string; vendedor: string },
) {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = reportRows(returns);
  const total = rows.reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0);

  const byBanco: Record<string, number> = {};
  rows.forEach(r => { const k = r.banco || "—"; byBanco[k] = (byBanco[k] ?? 0) + Number(r.valor_recebido ?? 0); });
  const byMonth: Record<string, number> = {};
  rows.forEach(r => { const k = monthKey(r.data_credito ?? ""); byMonth[k] = (byMonth[k] ?? 0) + Number(r.valor_recebido ?? 0); });
  const byVendedor: Record<string, number> = {};
  rows.forEach(r => { const k = r.vendedor || "—"; byVendedor[k] = (byVendedor[k] ?? 0) + Number(r.valor_recebido ?? 0); });

  const tableRows = rows.map(r => `
    <tr>
      <td>${monthLabel(monthKey(r.data_credito ?? ""))}</td>
      <td>${fmtDate(r.data_credito)}</td>
      <td>${r.banco ?? "—"}</td>
      <td>${r.cliente ?? "—"}</td>
      <td>${r.veiculo ?? "—"}</td>
      <td>${r.proposta ?? "—"}</td>
      <td>${TIPO_LABEL[r.tipo ?? ""] ?? "—"}</td>
      <td style="text-align:right;font-weight:700">${brl(Number(r.valor_recebido ?? 0))}</td>
    </tr>`).join("");

  const bancoRows = Object.entries(byBanco).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right;font-weight:700">${brl(v)}</td></tr>`).join("");
  const monthRows = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `<tr><td>${monthLabel(k)}</td><td style="text-align:right;font-weight:700">${brl(v)}</td></tr>`).join("");
  const vendedorRows = Object.entries(byVendedor).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right;font-weight:700">${brl(v)}</td></tr>`).join("");

  const filterDesc = [
    filters.dateFrom && `De: ${fmtDate(filters.dateFrom)}`,
    filters.dateTo && `Até: ${fmtDate(filters.dateTo)}`,
    filters.banco !== "todos" && `Banco: ${filters.banco}`,
    filters.vendedor !== "todos" && `Vendedor: ${filters.vendedor}`,
  ].filter(Boolean).join(" · ") || "Todos os registros recebidos";

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Retornos Bancários — ${storeName}</title>
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
      .total-box{background:#f8f8f8;border:1px solid #ddd;border-radius:6px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:16px}
      .total-box .label{font-size:12px;font-weight:700;color:#333}
      .total-box .value{font-size:18px;font-weight:800;color:#c1121f}
      @media print{body{padding:0}}
    </style>
  </head><body>
    <div class="header">
      <h1>${storeName}</h1>
      <p>Relatório de Retornos Bancários (para contabilidade) · Gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
      <p style="margin-top:6px;font-size:10px;color:#999">${filterDesc}</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:8px">
      <div><div class="section-title">Total por Banco</div><table><thead><tr><th>Banco</th><th style="text-align:right">Total</th></tr></thead><tbody>${bancoRows}</tbody></table></div>
      <div><div class="section-title">Total por Mês</div><table><thead><tr><th>Mês</th><th style="text-align:right">Total</th></tr></thead><tbody>${monthRows}</tbody></table></div>
      <div><div class="section-title">Total por Vendedor</div><table><thead><tr><th>Vendedor</th><th style="text-align:right">Total</th></tr></thead><tbody>${vendedorRows}</tbody></table></div>
    </div>
    <div class="section-title">Retornos Detalhados</div>
    <table>
      <thead><tr><th>Mês</th><th>Data Crédito</th><th>Banco</th><th>Cliente</th><th>Veículo</th><th>Proposta</th><th>Tipo</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="total-box">
      <span class="label">Total Geral</span>
      <span class="value">${brl(total)}</span>
    </div>
  </body></html>`);
  win.document.close();
  win.print();
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════ */
export default function RetornosBancariosPage() {
  const [userId, setUserId]       = useState<string | null>(null);
  const [storeName, setStoreName] = useState("CRM 7Business");
  const [sellers, setSellers]     = useState<string[]>([]);
  const [tab, setTab]             = useState<"lista" | "relatorio">("lista");

  const [returns, setReturns] = useState<BankReturn[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [search, setSearch]           = useState("");
  const [filterBanco, setFilterBanco] = useState("todos");
  const [filterVendedor, setFilterVendedor] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<BankReturn | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* ── auth + settings ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      fetch(`/api/settings?userId=${data.user.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.business_name) setStoreName(d.business_name);
          if (Array.isArray(d?.sellers)) setSellers(d.sellers);
        })
        .catch(() => {});
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/retornos-bancarios");
    if (res.ok) setReturns(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── opções dinâmicas ── */
  const bancoOptions = useMemo(
    () => Array.from(new Set(returns.map(r => r.banco).filter((b): b is string => !!b))).sort((a, b) => a.localeCompare(b)),
    [returns],
  );
  const vendedorOptions = useMemo(() => {
    const fromReturns = returns.map(r => r.vendedor).filter((v): v is string => !!v);
    return Array.from(new Set([...sellers, ...fromReturns])).sort((a, b) => a.localeCompare(b));
  }, [returns, sellers]);

  /* ── filtro aplicado (Lista + base do Relatório) ── */
  const filtered = useMemo(() => {
    return returns.filter(r => {
      if (filterStatus   !== "todos" && r.status !== filterStatus) return false;
      if (filterBanco    !== "todos" && (r.banco ?? "") !== filterBanco) return false;
      if (filterVendedor !== "todos" && (r.vendedor ?? "") !== filterVendedor) return false;
      const d = effectiveDate(r);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(r.cliente ?? "").toLowerCase().includes(q) && !(r.veiculo ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [returns, filterStatus, filterBanco, filterVendedor, dateFrom, dateTo, search]);

  /* ── KPIs (dashboard) ── */
  const kpi = useMemo(() => {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const recebidos = returns.filter(r => r.status === "recebido" || r.status === "faturado");
    const totalRecebidoMes = recebidos
      .filter(r => (r.data_credito ?? "").slice(0, 7) === curMonth)
      .reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0);
    const qtdPendentes = returns.filter(r => r.status === "aguardando_retorno").length;
    const qtdRecebidos = recebidos.length;
    const totalFiltro = filtered
      .filter(r => r.status === "recebido" || r.status === "faturado")
      .reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0);
    const porBanco: Record<string, number> = {};
    recebidos.forEach(r => { const b = r.banco || "—"; porBanco[b] = (porBanco[b] ?? 0) + Number(r.valor_recebido ?? 0); });
    return { totalRecebidoMes, qtdPendentes, qtdRecebidos, totalFiltro, porBanco };
  }, [returns, filtered]);

  /* ── modal helpers ── */
  function openEdit(r: BankReturn) {
    setEditing(r);
    setFormError(null);
    setForm({
      banco: r.banco ?? "", proposta: r.proposta ?? "",
      cliente: r.cliente ?? "", veiculo: r.veiculo ?? "",
      data_credito: r.data_credito ?? new Date().toISOString().split("T")[0],
      valor_recebido: r.valor_recebido != null ? String(r.valor_recebido) : "",
      tipo: (r.tipo ?? "comissao") as (typeof EMPTY_FORM)["tipo"],
      observacoes: r.observacoes ?? "", vendedor: r.vendedor ?? "",
      status: r.status === "aguardando_retorno" ? "recebido" : r.status,
    });
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setFormError(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  async function saveForm() {
    setFormError(null);
    if (form.status === "recebido" && (!form.valor_recebido || !form.data_credito)) {
      setFormError("Valor recebido e data do crédito são obrigatórios para marcar como Recebido.");
      return;
    }
    setSaving(true);
    const payload = {
      banco: form.banco || null,
      proposta: form.proposta || null,
      cliente: form.cliente || null,
      veiculo: form.veiculo || null,
      data_credito: form.data_credito || null,
      valor_recebido: form.valor_recebido ? Number(form.valor_recebido) : null,
      tipo: form.tipo || null,
      observacoes: form.observacoes || null,
      vendedor: form.vendedor || null,
      status: form.status,
    };

    const res = editing
      ? await fetch("/api/retornos-bancarios", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
      : await fetch("/api/retornos-bancarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: userId, ...payload }),
        });

    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setFormError(d.error ?? "Erro ao salvar");
      return;
    }
    setShowModal(false);
    fetchAll();
  }

  async function deleteReturn(id: string) {
    if (!confirm("Excluir este retorno? Se já estiver Recebido, a entrada correspondente no Fluxo de Caixa também será removida.")) return;
    await fetch(`/api/retornos-bancarios?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  /* ── styles ── */
  const inputStyle = { background: "#111827", borderColor: "#374151" };
  const sectionBg  = { background: "#0f172a", border: "1px solid #1f2937" };
  const TAB_STYLE = (active: boolean) => ({
    background:   active ? "rgba(230,57,70,0.15)" : "transparent",
    color:        active ? "#f87171" : "#6b7280",
    borderBottom: active ? "2px solid #e63946" : "2px solid transparent",
  });

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-screen p-4 sm:p-6" style={{ background: "#0a0f1a" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🏦 Retornos Bancários</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            Comissões, rebates e incentivos pagos pelos bancos nas vendas financiadas
          </p>
        </div>
        <button onClick={openNew}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white flex items-center gap-2 hover:opacity-90"
          style={{ background: "#e63946" }}>
          + Novo Retorno
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Recebido no Mês",       value: brl(kpi.totalRecebidoMes), color: "#10b981", icon: "💰" },
          { label: "Aguardando Retorno",    value: String(kpi.qtdPendentes),  color: "#3b82f6", icon: "⏳" },
          { label: "Recebidos (total)",     value: String(kpi.qtdRecebidos),  color: "#10b981", icon: "✅" },
          { label: "Total do Filtro Atual", value: brl(kpi.totalFiltro),      color: "#f87171", icon: "📊" },
        ].map(c => (
          <div key={c.label} className="rounded-2xl p-4" style={sectionBg}>
            <p className="text-xl mb-1">{c.icon}</p>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "#6b7280" }}>{c.label}</p>
            <p className="text-xl font-black" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Total por Banco */}
      {Object.keys(kpi.porBanco).length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={sectionBg}>
          <p className="text-sm font-bold text-white mb-4">🏦 Total por Banco</p>
          <div className="space-y-2">
            {(() => {
              const items = Object.entries(kpi.porBanco).sort((a, b) => b[1] - a[1]);
              const max = Math.max(...items.map(i => i[1]));
              return items.map(([banco, val]) => (
                <div key={banco} className="flex items-center gap-3">
                  <span className="text-xs w-32 shrink-0 truncate" style={{ color: "#9ca3af" }}>{banco}</span>
                  <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: "#1f2937" }}>
                    <div className="h-5 rounded-full transition-all" style={{ width: `${(val / max) * 100}%`, background: "#e63946" }} />
                  </div>
                  <span className="text-sm font-bold w-28 text-right shrink-0 text-white">{brl(val)}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "#1f2937" }}>
        {(["lista", "relatorio"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-semibold transition-all"
            style={TAB_STYLE(tab === t)}>
            {t === "lista" ? "📋 Retornos" : "📄 Relatório (Contabilidade)"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Carregando…</div>
      ) : tab === "lista" ? (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="rounded-2xl p-4" style={sectionBg}>
            <div className="flex flex-wrap gap-3">
              <input type="text" placeholder="🔍 Buscar cliente ou veículo..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500 flex-1 min-w-40"
                style={inputStyle} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todos status</option>
                {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select value={filterBanco} onChange={e => setFilterBanco(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todos bancos</option>
                {bancoOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todos vendedores</option>
                {vendedorOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
              <button onClick={() => { setSearch(""); setFilterBanco("todos"); setFilterVendedor("todos"); setFilterStatus("todos"); setDateFrom(""); setDateTo(""); }}
                className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#1f2937", color: "#9ca3af" }}>
                Limpar
              </button>
            </div>
          </div>

          {/* Tabela */}
          <div className="rounded-2xl overflow-hidden" style={sectionBg}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                  {["Status", "Banco", "Cliente", "Veículo", "Proposta", "Tipo", "Data Crédito", "Valor", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-600">Nenhum retorno encontrado</td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: "1px solid #1f293740" }}>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: (STATUS_COLOR[r.status] ?? "#6b7280") + "22", color: STATUS_COLOR[r.status] ?? "#9ca3af" }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">{r.banco ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{r.cliente ?? "—"}</p>
                      {r.vendedor && <p className="text-[10px]" style={{ color: "#6b7280" }}>Vend.: {r.vendedor}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.veiculo ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.proposta ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.tipo ? TIPO_LABEL[r.tipo] : "—"}</td>
                    <td className="px-4 py-3 text-white whitespace-nowrap">{fmtDate(r.data_credito)}</td>
                    <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                      {r.valor_recebido != null ? brl(Number(r.valor_recebido)) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(r)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-80"
                          style={{ background: r.status === "aguardando_retorno" ? "#3b82f622" : "#1f2937", color: r.status === "aguardando_retorno" ? "#3b82f6" : "#9ca3af" }}>
                          {r.status === "aguardando_retorno" ? "Preencher" : "✏️ Editar"}
                        </button>
                        <button onClick={() => deleteReturn(r.id)}
                          className="rounded-lg px-2 py-1.5 text-xs font-semibold hover:opacity-80"
                          style={{ background: "#ef444415", color: "#ef4444" }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Filtros do relatório (compartilha os mesmos filtros da lista) */}
          <div className="rounded-2xl p-4" style={sectionBg}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>Filtros do Relatório</p>
            <div className="flex flex-wrap gap-3">
              <select value={filterBanco} onChange={e => setFilterBanco(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todos bancos</option>
                {bancoOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todos vendedores</option>
                {vendedorOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
            </div>
            <p className="text-[11px] mt-3" style={{ color: "#6b7280" }}>
              O relatório considera apenas retornos com status Recebido ou Faturado (valores já creditados pelo banco).
            </p>
          </div>

          {/* Totais por Banco / Mês / Vendedor */}
          <div className="grid lg:grid-cols-3 gap-4">
            {[
              { title: "🏦 Total por Banco", map: (() => {
                const m: Record<string, number> = {};
                reportRows(filtered).forEach(r => { const k = r.banco || "—"; m[k] = (m[k] ?? 0) + Number(r.valor_recebido ?? 0); });
                return m;
              })() },
              { title: "📅 Total por Mês", map: (() => {
                const m: Record<string, number> = {};
                reportRows(filtered).forEach(r => { const k = monthKey(r.data_credito ?? ""); m[k] = (m[k] ?? 0) + Number(r.valor_recebido ?? 0); });
                return Object.fromEntries(Object.entries(m).map(([k, v]) => [monthLabel(k), v]));
              })() },
              { title: "👤 Total por Vendedor", map: (() => {
                const m: Record<string, number> = {};
                reportRows(filtered).forEach(r => { const k = r.vendedor || "—"; m[k] = (m[k] ?? 0) + Number(r.valor_recebido ?? 0); });
                return m;
              })() },
            ].map(({ title, map }) => (
              <div key={title} className="rounded-2xl p-5" style={sectionBg}>
                <p className="text-sm font-bold text-white mb-3">{title}</p>
                {Object.keys(map).length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: "#6b7280" }}>Nenhum dado</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center">
                        <span className="text-xs truncate" style={{ color: "#9ca3af" }}>{k}</span>
                        <span className="text-sm font-bold text-white">{brl(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Tabela detalhada */}
          <div className="rounded-2xl overflow-hidden" style={sectionBg}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                  {["Mês", "Data Crédito", "Banco", "Cliente", "Veículo", "Proposta", "Tipo", "Valor"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows(filtered).length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-600">Nenhum retorno recebido no filtro atual</td></tr>
                )}
                {reportRows(filtered).map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #1f293740" }}>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{monthLabel(monthKey(r.data_credito ?? ""))}</td>
                    <td className="px-4 py-3 text-white whitespace-nowrap">{fmtDate(r.data_credito)}</td>
                    <td className="px-4 py-3 text-white">{r.banco ?? "—"}</td>
                    <td className="px-4 py-3 text-white">{r.cliente ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.veiculo ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.proposta ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.tipo ? TIPO_LABEL[r.tipo] : "—"}</td>
                    <td className="px-4 py-3 font-bold text-white whitespace-nowrap">{brl(Number(r.valor_recebido ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Exportações */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => printReport(filtered, storeName, { dateFrom, dateTo, banco: filterBanco, vendedor: filterVendedor })}
              className="flex-1 min-w-40 rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
              style={{ background: "#e63946" }}>
              🖨️ Exportar PDF
            </button>
            <button onClick={() => exportXLSX(filtered, storeName)}
              className="flex-1 min-w-40 rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
              style={{ background: "#10b981" }}>
              📊 Exportar Excel
            </button>
            <button onClick={() => exportCSV(filtered, storeName)}
              className="flex-1 min-w-40 rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
              style={{ background: "#1d4ed8" }}>
              📥 Exportar CSV
            </button>
          </div>
        </div>
      )}

      {/* Modal Preencher/Editar Retorno */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-base font-black text-white">
                {editing ? "🏦 Preencher / Editar Retorno" : "➕ Novo Retorno Bancário"}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                style={{ background: "#1f2937" }}>✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Banco</label>
                  <input type="text" list="bancos-sugeridos" placeholder="Ex: Santander" value={form.banco}
                    onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500" style={inputStyle} />
                  <datalist id="bancos-sugeridos">
                    {BANCOS_SUGERIDOS.map(b => <option key={b} value={b} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Proposta</label>
                  <input type="text" placeholder="Nº da proposta" value={form.proposta}
                    onChange={e => setForm(f => ({ ...f, proposta: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500" style={inputStyle} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Cliente</label>
                  <input type="text" value={form.cliente}
                    onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Veículo</label>
                  <input type="text" value={form.veiculo}
                    onChange={e => setForm(f => ({ ...f, veiculo: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500" style={inputStyle} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data do Crédito</label>
                  <input type="date" value={form.data_credito}
                    onChange={e => setForm(f => ({ ...f, data_credito: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor Recebido (R$)</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00" value={form.valor_recebido}
                    onChange={e => setForm(f => ({ ...f, valor_recebido: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500" style={inputStyle} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as (typeof EMPTY_FORM)["tipo"] }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Vendedor</label>
                  <input type="text" list="vendedores-sugeridos" placeholder="Nome do vendedor" value={form.vendedor}
                    onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
                  <datalist id="vendedores-sugeridos">
                    {sellers.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as BankReturn["status"] }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                  {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Observações</label>
                <textarea rows={2} placeholder="Detalhes adicionais..." value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none resize-none" style={inputStyle} />
              </div>

              {formError && (
                <p className="text-xs font-semibold" style={{ color: "#ef4444" }}>{formError}</p>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={saveForm} disabled={saving}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#e63946" }}>
                {saving ? "Salvando…" : "✓ Salvar"}
              </button>
              <button onClick={() => setShowModal(false)}
                className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: "#1f2937", color: "#9ca3af" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
