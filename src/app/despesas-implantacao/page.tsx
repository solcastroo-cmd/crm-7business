"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

/* ── Types ─────────────────────────────────────────────────────────── */
type Despesa = {
  id: string;
  loja_id: string;
  descricao: string;
  categoria: "ativo_imobilizado" | "uso_e_consumo" | "outros";
  valor: number;
  data_despesa: string;
  observacao?: string;
  forma_pagamento?: string;
  parcelas?: number;
  valor_parcela?: number;
  data_vencimento?: string;
  created_at: string;
  updated_at: string;
};

/* ── Constants ──────────────────────────────────────────────────────── */
const CATEGORIAS = [
  { value: "ativo_imobilizado", label: "Aquisição e Instalação (Ativo Imobilizado)" },
  { value: "uso_e_consumo",     label: "Uso e Consumo (Despesa Operacional)" },
  { value: "outros",            label: "Outros" },
] as const;

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map(c => [c.value, c.label]),
);

const CAT_COLOR: Record<string, string> = {
  ativo_imobilizado: "#f59e0b",
  uso_e_consumo:     "#e63946",
  outros:            "#6b7280",
};

const FORMAS_PAGAMENTO = [
  { value: "avista",         label: "À Vista" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito",  label: "Cartão de Débito" },
  { value: "pix",            label: "PIX" },
  { value: "boleto",         label: "Boleto" },
  { value: "transferencia",  label: "Transferência" },
  { value: "financiado",     label: "Financiado" },
  { value: "outros",         label: "Outros" },
] as const;

const PAGTO_LABEL: Record<string, string> = Object.fromEntries(
  FORMAS_PAGAMENTO.map(f => [f.value, f.label]),
);

const EMPTY_FORM = {
  descricao: "",
  categoria: "ativo_imobilizado" as Despesa["categoria"],
  valor: "",
  data_despesa: new Date().toISOString().split("T")[0],
  observacao: "",
  forma_pagamento: "avista",
  parcelas: "1",
  valor_parcela: "",
  data_vencimento: "",
};

/* ── Helpers ────────────────────────────────────────────────────────── */
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}
function proximoVencimento(dataVencimento: string, parcelas: number) {
  const hoje = new Date().toISOString().split("T")[0];
  for (let i = 0; i < parcelas; i++) {
    const venc = addMonths(dataVencimento, i);
    if (venc >= hoje) return { parcela: i + 1, data: venc };
  }
  return { parcela: parcelas, data: addMonths(dataVencimento, parcelas - 1) };
}
function expandParcelas(d: Despesa): { date: string; valor: number; label: string }[] {
  const parcelas = d.parcelas ?? 1;
  if (d.forma_pagamento === "cartao_credito" && d.data_vencimento && parcelas > 1) {
    const valorParcela = d.valor_parcela ?? Number(d.valor) / parcelas;
    return Array.from({ length: parcelas }, (_, i) => ({
      date: addMonths(d.data_vencimento!, i),
      valor: Number(valorParcela),
      label: `${d.descricao} (parcela ${i + 1}/${parcelas})`,
    }));
  }
  const dataBase = d.forma_pagamento === "cartao_credito" && d.data_vencimento ? d.data_vencimento : d.data_despesa;
  return [{ date: dataBase, valor: Number(d.valor), label: d.descricao }];
}
type LinhaVencimento = { date: string; valor: number; label: string; despesa: Despesa };
function gerarLinhasVencimento(
  despesas: Despesa[],
  dateFrom: string,
  dateTo: string,
): LinhaVencimento[] {
  return despesas
    .flatMap(d => expandParcelas(d).map(item => ({ ...item, despesa: d })))
    .filter(l => (!dateFrom || l.date >= dateFrom) && (!dateTo || l.date <= dateTo))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
}

/* ── CSV Export ─────────────────────────────────────────────────────── */
function exportCSV(
  linhas: LinhaVencimento[],
  storeName: string,
  filters: { dateFrom: string; dateTo: string; categoria: string; pagamento?: string },
) {
  const filterDesc = [
    filters.dateFrom && `De ${fmtDate(filters.dateFrom)}`,
    filters.dateTo   && `Ate ${fmtDate(filters.dateTo)}`,
    filters.categoria !== "todas" && CAT_LABEL[filters.categoria],
    filters.pagamento && filters.pagamento !== "todas" && PAGTO_LABEL[filters.pagamento],
  ].filter(Boolean).join(" - ") || "todos";

  const header = ["Vencimento", "Descricao", "Categoria", "Forma Pagamento", "Valor (R$)", "Observacao"];
  const rows = linhas.map(({ date, valor, label, despesa: d }) => [
    fmtDate(date),
    `"${label.replace(/"/g, '""')}"`,
    `"${(CAT_LABEL[d.categoria] ?? d.categoria).replace(/"/g, '""')}"`,
    `"${(PAGTO_LABEL[d.forma_pagamento ?? "avista"] ?? d.forma_pagamento ?? "").replace(/"/g, '""')}"`,
    valor.toFixed(2).replace(".", ","),
    `"${(d.observacao ?? "").replace(/"/g, '""')}"`,
  ]);

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const bycat: Record<string, number> = {};
  linhas.forEach(l => { bycat[l.despesa.categoria] = (bycat[l.despesa.categoria] ?? 0) + l.valor; });
  const bypagto: Record<string, number> = {};
  linhas.forEach(l => { const k = l.despesa.forma_pagamento ?? "avista"; bypagto[k] = (bypagto[k] ?? 0) + l.valor; });

  const bymonth: Record<string, LinhaVencimento[]> = {};
  linhas.forEach(l => { const k = monthKey(l.date); (bymonth[k] ??= []).push(l); });
  const monthEntries = Object.entries(bymonth).sort((a, b) => a[0].localeCompare(b[0]));
  const monthLines = monthEntries.flatMap(([k, itens]) => {
    const totalMes = itens.reduce((s, i) => s + i.valor, 0);
    return [
      `"${monthLabel(k)}";"${totalMes.toFixed(2).replace(".", ",")}"`,
      ...[...itens].sort((a, b) => a.date.localeCompare(b.date)).map(
        i => `"  ${fmtDate(i.date)} - ${i.label.replace(/"/g, '""')}";"${i.valor.toFixed(2).replace(".", ",")}"`,
      ),
    ];
  });

  const lines = [
    `"${storeName} - Despesas de Implantacao (${filterDesc})"`,
    "",
    header.join(";"),
    ...rows.map(r => r.join(";")),
    "",
    "RESUMO POR CATEGORIA",
    ...Object.entries(bycat).sort((a, b) => b[1] - a[1]).map(
      ([cat, val]) => `"${CAT_LABEL[cat] ?? cat}";"${val.toFixed(2).replace(".", ",")}"`,
    ),
    "",
    "TOTAL POR FORMA DE PAGAMENTO",
    ...Object.entries(bypagto).sort((a, b) => b[1] - a[1]).map(
      ([p, val]) => `"${PAGTO_LABEL[p] ?? p}";"${val.toFixed(2).replace(".", ",")}"`,
    ),
    "",
    "POR VENCIMENTO (MES A MES) - com detalhe de cada lancamento",
    ...monthLines,
    "",
    ["\"TOTAL GERAL\"", "", "", "", `"${total.toFixed(2).replace(".", ",")}"`, ""].join(";"),
  ];

  const bom = "﻿";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `despesas-implantacao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── PDF Report ─────────────────────────────────────────────────────── */
function printReport(
  linhas: LinhaVencimento[],
  storeName: string,
  filters: { dateFrom: string; dateTo: string; categoria: string; pagamento?: string },
) {
  const win = window.open("", "_blank");
  if (!win) return;

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const bycat: Record<string, number> = {};
  linhas.forEach(l => { bycat[l.despesa.categoria] = (bycat[l.despesa.categoria] ?? 0) + l.valor; });

  const rows = linhas.map(({ date, valor, label, despesa: d }) => `
    <tr>
      <td>${fmtDate(date)}</td>
      <td>${label}</td>
      <td>${CAT_LABEL[d.categoria] ?? d.categoria}</td>
      <td>${PAGTO_LABEL[d.forma_pagamento ?? "avista"] ?? d.forma_pagamento}</td>
      <td style="text-align:right">${brl(valor)}</td>
      <td style="color:#6b7280;font-size:10px">${d.observacao ?? ""}</td>
    </tr>`).join("");

  const catRows = Object.entries(bycat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `<tr><td>${CAT_LABEL[cat] ?? cat}</td><td style="text-align:right;font-weight:700">${brl(val)}</td></tr>`)
    .join("");

  const bypagto: Record<string, number> = {};
  linhas.forEach(l => { const k = l.despesa.forma_pagamento ?? "avista"; bypagto[k] = (bypagto[k] ?? 0) + l.valor; });
  const pagtoRows = Object.entries(bypagto)
    .sort((a, b) => b[1] - a[1])
    .map(([p, val]) => `<tr><td>${PAGTO_LABEL[p] ?? p}</td><td style="text-align:right;font-weight:700">${brl(val)}</td></tr>`)
    .join("");

  const bymonth: Record<string, LinhaVencimento[]> = {};
  linhas.forEach(l => { const k = monthKey(l.date); (bymonth[k] ??= []).push(l); });
  const monthRows = Object.entries(bymonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, itens]) => {
      const totalMes = itens.reduce((s, i) => s + i.valor, 0);
      const itemRows = [...itens].sort((a, b) => a.date.localeCompare(b.date))
        .map(i => `<tr><td style="padding-left:20px;color:#666">${fmtDate(i.date)} — ${i.label}</td><td style="text-align:right;color:#666">${brl(i.valor)}</td></tr>`)
        .join("");
      return `<tr><td style="font-weight:700;background:#fafafa">${monthLabel(k)}</td><td style="text-align:right;font-weight:700;background:#fafafa">${brl(totalMes)}</td></tr>${itemRows}`;
    })
    .join("");

  const filterDesc = [
    filters.dateFrom && `De: ${fmtDate(filters.dateFrom)}`,
    filters.dateTo   && `Até: ${fmtDate(filters.dateTo)}`,
    filters.categoria !== "todas" && `Categoria: ${CAT_LABEL[filters.categoria]}`,
    filters.pagamento && filters.pagamento !== "todas" && `Pagamento: ${PAGTO_LABEL[filters.pagamento]}`,
  ].filter(Boolean).join(" · ") || "Todos os registros";

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Despesas de Implantação — ${storeName}</title>
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
      <p>Despesas de Implantação · Gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
      <p style="margin-top:6px;font-size:10px;color:#999">${filterDesc}</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px">
      <div>
        <div class="section-title">Resumo por Categoria</div>
        <table>
          <thead><tr><th>Categoria</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>
      <div>
        <div class="section-title">💳 Total por Forma de Pagamento</div>
        <table>
          <thead><tr><th>Forma de Pagamento</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${pagtoRows}</tbody>
        </table>
      </div>
    </div>
    <div class="section-title">📅 Por Vencimento (mês a mês)</div>
    <table>
      <thead><tr><th>Mês</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${monthRows}</tbody>
    </table>
    <div class="section-title">Despesas Detalhadas (por vencimento)</div>
    <table>
      <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th style="text-align:right">Valor</th><th>Observação</th></tr></thead>
      <tbody>${rows}</tbody>
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
export default function DespesasImplantacaoPage() {
  const [userId, setUserId]       = useState<string | null>(null);
  const [storeName, setStoreName] = useState("CRM 7Business");
  const [tab, setTab]             = useState<"lista" | "relatorio">("lista");

  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading]   = useState(true);

  // filtros
  const [filterCat, setFilterCat]     = useState("todas");
  const [filterPagto, setFilterPagto] = useState("todas");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [search, setSearch]       = useState("");

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Despesa | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);

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

  /* ── fetch ── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/despesas-implantacao");
    if (res.ok) setDespesas(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── filtros ── */
  const filtered = useMemo(() => {
    return despesas.filter(d => {
      if (filterCat   !== "todas" && d.categoria        !== filterCat)   return false;
      if (filterPagto !== "todas" && (d.forma_pagamento ?? "avista") !== filterPagto) return false;
      if (dateFrom && d.data_despesa < dateFrom) return false;
      if (dateTo   && d.data_despesa > dateTo)   return false;
      if (search) {
        const q = search.toLowerCase();
        if (!d.descricao.toLowerCase().includes(q) &&
            !(d.observacao ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [despesas, filterCat, dateFrom, dateTo, search]);

  // para o relatorio: filtra por categoria/pagamento/busca, mas NAO por data aqui —
  // o periodo se aplica depois, sobre a data de vencimento de cada parcela, nao a data da compra
  const filtradoParaRelatorio = useMemo(() => {
    return despesas.filter(d => {
      if (filterCat   !== "todas" && d.categoria        !== filterCat)   return false;
      if (filterPagto !== "todas" && (d.forma_pagamento ?? "avista") !== filterPagto) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!d.descricao.toLowerCase().includes(q) &&
            !(d.observacao ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [despesas, filterCat, filterPagto, search]);

  const linhasRelatorio = useMemo(
    () => gerarLinhasVencimento(filtradoParaRelatorio, dateFrom, dateTo),
    [filtradoParaRelatorio, dateFrom, dateTo],
  );

  /* ── KPIs ── */
  const kpi = useMemo(() => {
    const total       = despesas.reduce((s, d) => s + Number(d.valor), 0);
    const ativo       = despesas.filter(d => d.categoria === "ativo_imobilizado").reduce((s, d) => s + Number(d.valor), 0);
    const operacional = despesas.filter(d => d.categoria === "uso_e_consumo").reduce((s, d) => s + Number(d.valor), 0);
    const outros      = despesas.filter(d => d.categoria === "outros").reduce((s, d) => s + Number(d.valor), 0);
    return { total, ativo, operacional, outros };
  }, [despesas]);

  /* ── modal helpers ── */
  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }
  function openEdit(d: Despesa) {
    setEditing(d);
    setForm({
      descricao:       d.descricao,
      categoria:       d.categoria,
      valor:           String(d.valor),
      data_despesa:    d.data_despesa,
      observacao:      d.observacao ?? "",
      forma_pagamento: d.forma_pagamento ?? "avista",
      parcelas:        String(d.parcelas ?? 1),
      valor_parcela:   d.valor_parcela ? String(d.valor_parcela) : "",
      data_vencimento: d.data_vencimento ?? "",
    });
    setShowModal(true);
  }

  async function saveForm() {
    if (!form.descricao || !form.valor || !userId) return;
    setSaving(true);
    const isCartao = form.forma_pagamento === "cartao_credito";
    const payload = {
      loja_id:         userId,
      descricao:       form.descricao,
      categoria:       form.categoria,
      valor:           Number(form.valor),
      data_despesa:    form.data_despesa,
      observacao:      form.observacao || null,
      forma_pagamento: form.forma_pagamento,
      parcelas:        isCartao ? Number(form.parcelas) : 1,
      valor_parcela:   isCartao && form.valor_parcela ? Number(form.valor_parcela) : null,
      data_vencimento: isCartao && form.data_vencimento ? form.data_vencimento : null,
    };

    const res = editing
      ? await fetch("/api/despesas-implantacao", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
      : await fetch("/api/despesas-implantacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) { alert("Erro ao salvar despesa"); setSaving(false); return; }
    setSaving(false);
    setShowModal(false);
    fetchAll();
  }

  async function deleteDespesa(id: string) {
    if (!confirm("Excluir esta despesa?")) return;
    await fetch(`/api/despesas-implantacao?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  function setMonth(offset: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    setDateFrom(`${y}-${m}-01`);
    setDateTo(`${y}-${m}-${new Date(y, d.getMonth() + 1, 0).getDate()}`);
  }

  /* ── styles ── */
  const inputStyle  = { background: "#111827", borderColor: "#374151" };
  const sectionBg   = { background: "#0f172a", border: "1px solid #1f2937" };
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
          <h1 className="text-2xl font-black text-white">🏗️ Despesas de Implantação</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            Controle de investimentos e custos de abertura da loja
          </p>
        </div>
        <button onClick={openNew}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white flex items-center gap-2 hover:opacity-90"
          style={{ background: "#e63946" }}>
          + Nova Despesa
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Geral",            value: kpi.total,       color: "#f87171", icon: "💸" },
          { label: "Ativo Imobilizado",       value: kpi.ativo,       color: "#f59e0b", icon: "🏢" },
          { label: "Despesa Operacional",     value: kpi.operacional, color: "#e63946", icon: "⚙️" },
          { label: "Outros",                  value: kpi.outros,      color: "#6b7280", icon: "📦" },
        ].map(c => (
          <div key={c.label} className="rounded-2xl p-4" style={sectionBg}>
            <p className="text-xl mb-1">{c.icon}</p>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "#6b7280" }}>{c.label}</p>
            <p className="text-xl font-black" style={{ color: c.color }}>{brl(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "#1f2937" }}>
        {(["lista", "relatorio"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-semibold capitalize transition-all"
            style={TAB_STYLE(tab === t)}>
            {t === "lista" ? "📋 Despesas" : "📄 Relatório"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Carregando…</div>
      ) : (
        <>
          {/* ══ TAB LISTA ══ */}
          {tab === "lista" && (
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
                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle} />
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle} />
                  <button onClick={() => { setDateFrom(""); setDateTo(""); setFilterCat("todas"); setSearch(""); }}
                    className="rounded-xl px-3 py-2 text-xs font-semibold"
                    style={{ background: "#1f2937", color: "#9ca3af" }}>
                    Limpar
                  </button>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {[
                    { label: "Este mês",    fn: () => setMonth(0)  },
                    { label: "Mês passado", fn: () => setMonth(-1) },
                  ].map(a => (
                    <button key={a.label} onClick={a.fn}
                      className="rounded-lg px-3 py-1 text-xs font-semibold"
                      style={{ background: "#1f2937", color: "#9ca3af" }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total filtrado */}
              <div className="rounded-2xl px-5 py-3 flex justify-between items-center" style={sectionBg}>
                <span className="text-sm font-semibold" style={{ color: "#6b7280" }}>
                  {filtered.length} registro{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
                </span>
                <span className="text-xl font-black" style={{ color: "#f87171" }}>
                  {brl(filtered.reduce((s, d) => s + Number(d.valor), 0))}
                </span>
              </div>

              {/* Tabela */}
              <div className="rounded-2xl overflow-hidden" style={sectionBg}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                      {["Data", "Descrição", "Categoria", "Pagamento", "Valor", "Ações"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: "#6b7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-12 text-gray-600">
                        Nenhuma despesa encontrada
                      </td></tr>
                    )}
                    {filtered.map(d => (
                      <tr key={d.id} className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: "1px solid #1f293740" }}>
                        <td className="px-4 py-3 text-white whitespace-nowrap">{fmtDate(d.data_despesa)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">{d.descricao}</p>
                          {d.observacao && (
                            <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>{d.observacao}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-1 rounded-lg"
                            style={{
                              background: (CAT_COLOR[d.categoria] ?? "#6b7280") + "22",
                              color:       CAT_COLOR[d.categoria] ?? "#9ca3af",
                            }}>
                            {CAT_LABEL[d.categoria] ?? d.categoria}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: "#9ca3af" }}>
                          <div>{PAGTO_LABEL[d.forma_pagamento ?? "avista"] ?? d.forma_pagamento}</div>
                          {d.forma_pagamento === "cartao_credito" && (d.parcelas ?? 1) > 1 && (
                            <div className="text-[10px] mt-0.5" style={{ color: "#f59e0b" }}>
                              💳 {d.parcelas}x {d.valor_parcela ? `de ${brl(Number(d.valor_parcela))}` : ""}
                            </div>
                          )}
                          {d.forma_pagamento === "cartao_credito" && d.data_vencimento && (() => {
                            const hoje = new Date().toISOString().split("T")[0];
                            const prox = proximoVencimento(d.data_vencimento!, d.parcelas ?? 1);
                            const quitado = prox.data < hoje;
                            return (
                              <div className="text-[10px] mt-0.5" style={{ color: quitado ? "#6b7280" : "#3b82f6" }}>
                                📅 {quitado ? "Quitado" : `venc. ${fmtDate(prox.data)} (${prox.parcela}/${d.parcelas ?? 1})`}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                          {brl(Number(d.valor))}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(d)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                              style={{ background: "#1f2937", color: "#9ca3af" }}>✏️</button>
                            <button onClick={() => deleteDespesa(d.id)}
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
              {/* Filtros */}
              <div className="rounded-2xl p-4" style={sectionBg}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>
                  Filtros do Relatório
                </p>
                <div className="flex flex-wrap gap-3">
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todas">Todas categorias</option>
                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <select value={filterPagto} onChange={e => setFilterPagto(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle}>
                    <option value="todas">Todas as formas de pagamento</option>
                    {FORMAS_PAGAMENTO.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle} />
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                    style={inputStyle} />
                  <div className="flex gap-2">
                    {[{ l: "Este mês", f: () => setMonth(0) }, { l: "Mês passado", f: () => setMonth(-1) }].map(a => (
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
                <div className="space-y-3">
                  {(() => {
                    const catMap: Record<string, number> = {};
                    linhasRelatorio.forEach(l => { catMap[l.despesa.categoria] = (catMap[l.despesa.categoria] ?? 0) + l.valor; });
                    const items = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
                    if (!items.length) return (
                      <p className="text-sm text-center py-4" style={{ color: "#6b7280" }}>Nenhum dado</p>
                    );
                    const totalFiltrado = linhasRelatorio.reduce((s, l) => s + l.valor, 0.001);
                    const max = Math.max(...items.map(i => i[1]));
                    return items.map(([cat, val]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-xs w-48 shrink-0 truncate" style={{ color: "#9ca3af" }}>
                          {CAT_LABEL[cat] ?? cat}
                        </span>
                        <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: "#1f2937" }}>
                          <div className="h-5 rounded-full transition-all"
                            style={{ width: `${(val / max) * 100}%`, background: CAT_COLOR[cat] ?? "#6b7280" }} />
                        </div>
                        <span className="text-sm font-bold w-28 text-right shrink-0 text-white">{brl(val)}</span>
                        <span className="text-[10px] w-10 text-right shrink-0" style={{ color: "#6b7280" }}>
                          {((val / totalFiltrado) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ));
                  })()}
                </div>
                <div className="mt-4 flex justify-between items-center border-t pt-4" style={{ borderColor: "#1f2937" }}>
                  <span className="text-sm font-bold text-white">Total do Período</span>
                  <span className="text-2xl font-black" style={{ color: "#e63946" }}>
                    {brl(linhasRelatorio.reduce((s, l) => s + l.valor, 0))}
                  </span>
                </div>
              </div>

              {/* Totais por Forma de Pagamento */}
              <div className="rounded-2xl p-5" style={sectionBg}>
                <p className="text-sm font-bold text-white mb-4">💳 Total por Forma de Pagamento</p>
                {(() => {
                  const pagMap: Record<string, number> = {};
                  linhasRelatorio.forEach(l => {
                    const k = l.despesa.forma_pagamento ?? "avista";
                    pagMap[k] = (pagMap[k] ?? 0) + l.valor;
                  });
                  const items = Object.entries(pagMap).sort((a, b) => b[1] - a[1]);
                  if (!items.length) return (
                    <p className="text-sm text-center py-4" style={{ color: "#6b7280" }}>Nenhum dado</p>
                  );
                  const totalFiltrado = linhasRelatorio.reduce((s, l) => s + l.valor, 0.001);
                  const max = Math.max(...items.map(i => i[1]));
                  const PAG_COLOR: Record<string, string> = {
                    avista: "#10b981", pix: "#06b6d4", cartao_credito: "#f59e0b",
                    cartao_debito: "#8b5cf6", boleto: "#6b7280", transferencia: "#3b82f6",
                    financiado: "#e63946", outros: "#9ca3af",
                  };
                  return (
                    <div className="space-y-3">
                      {items.map(([pag, val]) => (
                        <div key={pag} className="flex items-center gap-3">
                          <span className="text-xs w-36 shrink-0 truncate" style={{ color: "#9ca3af" }}>
                            {PAGTO_LABEL[pag] ?? pag}
                          </span>
                          <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: "#1f2937" }}>
                            <div className="h-5 rounded-full transition-all"
                              style={{ width: `${(val / max) * 100}%`, background: PAG_COLOR[pag] ?? "#6b7280" }} />
                          </div>
                          <span className="text-sm font-bold w-28 text-right shrink-0 text-white">{brl(val)}</span>
                          <span className="text-[10px] w-10 text-right shrink-0" style={{ color: "#6b7280" }}>
                            {((val / totalFiltrado) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                      <div className="mt-3 flex justify-between items-center border-t pt-3" style={{ borderColor: "#1f2937" }}>
                        <span className="text-xs font-bold" style={{ color: "#6b7280" }}>Total</span>
                        <span className="text-lg font-black" style={{ color: "#f87171" }}>
                          {brl(linhasRelatorio.reduce((s, l) => s + l.valor, 0))}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Por Vencimento (mês a mês) */}
              <div className="rounded-2xl p-5" style={sectionBg}>
                <p className="text-sm font-bold text-white mb-1">📅 Por Vencimento (mês a mês)</p>
                <p className="text-[11px] mb-4" style={{ color: "#6b7280" }}>
                  Quanto sai do caixa a cada mês, com o detalhe de cada lançamento que compõe o total — considerando o vencimento real, não a data da compra
                </p>
                <div className="space-y-4">
                  {(() => {
                    const mm: Record<string, { date: string; label: string; valor: number }[]> = {};
                    linhasRelatorio.forEach(({ date, valor, label }) => {
                      const k = monthKey(date);
                      (mm[k] ??= []).push({ date, label, valor });
                    });
                    const entries = Object.entries(mm).sort((a, b) => a[0].localeCompare(b[0]));
                    if (!entries.length) return (
                      <p className="text-sm text-center py-4" style={{ color: "#6b7280" }}>Sem dados de vencimento</p>
                    );
                    return entries.map(([k, itens]) => {
                      const totalMes = itens.reduce((s, i) => s + i.valor, 0);
                      const ordenados = [...itens].sort((a, b) => a.date.localeCompare(b.date));
                      return (
                        <div key={k} className="rounded-xl overflow-hidden" style={{ background: "#111827" }}>
                          <div className="flex justify-between items-center px-4 py-2.5" style={{ background: "#1f2937" }}>
                            <span className="text-xs font-bold text-white">{monthLabel(k)}</span>
                            <span className="text-sm font-black" style={{ color: "#3b82f6" }}>{brl(totalMes)}</span>
                          </div>
                          <div>
                            {ordenados.map((i, idx) => (
                              <div key={idx} className="flex justify-between items-center px-4 py-2"
                                style={{ borderTop: idx > 0 ? "1px solid #1f293780" : "none" }}>
                                <span className="text-xs shrink-0 w-16" style={{ color: "#6b7280" }}>{fmtDate(i.date)}</span>
                                <span className="text-xs truncate flex-1 px-3" style={{ color: "#9ca3af" }}>{i.label}</span>
                                <span className="text-xs font-semibold text-white whitespace-nowrap">{brl(i.valor)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => printReport(linhasRelatorio, storeName, { dateFrom, dateTo, categoria: filterCat, pagamento: filterPagto })}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
                  style={{ background: "#e63946" }}>
                  🖨️ Exportar PDF
                </button>
                <button
                  onClick={() => exportCSV(linhasRelatorio, storeName, { dateFrom, dateTo, categoria: filterCat, pagamento: filterPagto })}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
                  style={{ background: "#1d4ed8" }}>
                  📥 Exportar CSV
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ MODAL ══ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-base font-black text-white">
                {editing ? "✏️ Editar Despesa" : "➕ Nova Despesa de Implantação"}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                style={{ background: "#1f2937" }}>✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data *</label>
                  <input type="date" value={form.data_despesa}
                    onChange={e => setForm(f => ({ ...f, data_despesa: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                    style={inputStyle} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor (R$) *</label>
                  <input type="number" min="0.01" step="0.01" placeholder="0,00" value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                    style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Descrição *</label>
                <input type="text" placeholder="Ex: Computador para recepção" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-red-500"
                  style={inputStyle} />
              </div>

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Categoria *</label>
                <select value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Despesa["categoria"] }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                  style={inputStyle}>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Forma de Pagamento *</label>
                <select value={form.forma_pagamento}
                  onChange={e => {
                    const fp = e.target.value;
                    setForm(f => ({
                      ...f, forma_pagamento: fp,
                      parcelas: fp === "cartao_credito" ? f.parcelas : "1",
                      valor_parcela: "",
                      data_vencimento: fp === "cartao_credito" ? f.data_vencimento : "",
                    }));
                  }}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                  style={inputStyle}>
                  {FORMAS_PAGAMENTO.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {/* Parcelas — só para Cartão de Crédito */}
              {form.forma_pagamento === "cartao_credito" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                      💳 Parcelas (até 24x)
                    </label>
                    <select value={form.parcelas}
                      onChange={e => {
                        const n = Number(e.target.value);
                        const parcela = n > 0 && Number(form.valor) > 0
                          ? (Number(form.valor) / n).toFixed(2)
                          : "";
                        setForm(f => ({ ...f, parcelas: String(n), valor_parcela: parcela }));
                      }}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={inputStyle}>
                      {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}x</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor da Parcela (R$)</label>
                    <input type="number" step="0.01" placeholder="0,00" value={form.valor_parcela}
                      onChange={e => setForm(f => ({ ...f, valor_parcela: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={inputStyle} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                      📅 Vencimento da 1ª Parcela
                    </label>
                    <input type="date" value={form.data_vencimento}
                      onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none"
                      style={inputStyle} />
                    <p className="text-[10px] mt-1" style={{ color: "#6b7280" }}>
                      As demais parcelas vencem automaticamente no mesmo dia, mês a mês.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Observação</label>
                <textarea rows={2} placeholder="Detalhes adicionais, número de nota fiscal, fornecedor..." value={form.observacao}
                  onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none resize-none"
                  style={inputStyle} />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={saveForm}
                disabled={saving || !form.descricao || !form.valor}
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
