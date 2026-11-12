"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useUserId } from "@/hooks/useUserId";
import Link from "next/link";
import { ResponsavelPicker, LancadoPor } from "@/components/ResponsavelPicker";
import { STORE_EXPENSE_CATEGORIES } from "@/lib/storeExpenseCategories";

/* ── Types ─────────────────────────────────────────────────────────── */
type LedgerEntry = {
  id: string;
  date: string;
  type: "entrada" | "saida";
  description: string;
  category: string;
  amount: number;
  source: "venda" | "recebimento" | "despesa_loja" | "despesa_veiculo";
  saldo: number;
  lancado_por?: string | null;
  editado_por?: string | null;
  socio?: string | null;
  notes?: string | null;
};

type Conta = {
  id: string;
  name: string;
  balance: number;
  referenceDate: string;
  saldoAtual: number;
};

type Summary = {
  saldoAnterior: number;
  entradas: number;
  saidas: number;
  saldoPeriodo: number;
  saldoAcumulado: number;
  contas: Conta[];
  saldoTotalContas: number;
};

const CATEGORIES = [
  "Comissão", "Aporte de Sócio", "Aluguel Recebido", "Serviço Avulso", "Reembolso", "Outros",
];

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "cartao", label: "Cartão" },
];

const SOURCE_LABEL: Record<string, string> = {
  venda: "Venda", recebimento: "Recebimento", despesa_loja: "Despesa Loja", despesa_veiculo: "Despesa Veículo",
};

const EMPTY_FORM = {
  date: new Date().toISOString().split("T")[0],
  description: "", category: CATEGORIES[0],
  amount: "", payment_method: "pix",
  responsavel: "",
  socios: [] as string[],
  partes: {} as Record<string, string>,
};

const EMPTY_ACCOUNT_FORM = {
  name: "", balance: "",
  reference_date: new Date().toISOString().split("T")[0],
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

const APORTE_CATEGORY = "Aporte de Sócio";
const RESSARCIMENTO_CATEGORY = "Ressarcimento de Sócio";
const SOCIOS_APORTE = ["Paulo Henrique", "Eduardo Maia", "Loja"];
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function mesLabel(k: string) {
  const [y, m] = k.split("-");
  return `${MESES_CURTOS[parseInt(m) - 1]}/${y.slice(2)}`;
}

const PROLABORE_CATEGORY = "Pró-labore";
function socioDoProlabore(e: LedgerEntry) {
  if (e.socio) return e.socio;
  if (/\b(PH|PAULO)\b/i.test(e.description)) return "Paulo Henrique";
  if (/(EDUARDO|DUDU)/i.test(e.description)) return "Eduardo Maia";
  return "Não informado";
}
// pró-labore (comissão) recebido por sócio, no total e por mês
function prolaborePorSocio(entries: LedgerEntry[]) {
  const itens = entries.filter(e => e.type === "saida" && e.category === PROLABORE_CATEGORY)
    .sort((a, b) => a.date.localeCompare(b.date));
  const tot: Record<string, number> = {};
  const mat: Record<string, Record<string, number>> = {};
  for (const e of itens) {
    const k = socioDoProlabore(e);
    tot[k] = (tot[k] ?? 0) + Number(e.amount);
    const m = e.date.slice(0, 7);
    (mat[m] ??= {})[k] = (mat[m][k] ?? 0) + Number(e.amount);
  }
  const ordem = ["Paulo Henrique", "Eduardo Maia"];
  const nomes = [...ordem.filter(n => tot[n]), ...Object.keys(tot).filter(n => !ordem.includes(n)).sort()];
  return { itens, nomes, tot, mat, total: itens.reduce((s, e) => s + Number(e.amount), 0) };
}

const DISTRIBUICAO_CATEGORY = "Distribuição de Lucros";
function distribuicoes(entries: LedgerEntry[]) {
  const itens = entries.filter(e => e.type === "saida" && e.category === DISTRIBUICAO_CATEGORY)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { itens, total: itens.reduce((s, e) => s + Number(e.amount), 0) };
}

// soma os aportes de sócio por pessoa e por mês
function aportesPorSocio(entries: LedgerEntry[]) {
  const ap = entries.filter(e => e.type === "entrada" && e.category === APORTE_CATEGORY);
  const tot: Record<string, number> = {};
  const mat: Record<string, Record<string, number>> = {};
  for (const e of ap) {
    const k = e.socio || "Não informado";
    tot[k] = (tot[k] ?? 0) + Number(e.amount);
    const m = e.date.slice(0, 7);
    (mat[m] ??= {})[k] = (mat[m][k] ?? 0) + Number(e.amount);
  }
  const nomes = [
    ...SOCIOS_APORTE.filter(n => tot[n]),
    ...Object.keys(tot).filter(n => !SOCIOS_APORTE.includes(n)).sort(),
  ];
  const total = ap.reduce((s, e) => s + Number(e.amount), 0);
  // ressarcimento de sócio: devolução do que o sócio pagou pela loja, abate os aportes dele
  const dev: Record<string, number> = {};
  for (const e of entries) {
    if (e.type === "saida" && e.category === RESSARCIMENTO_CATEGORY) {
      const k = e.socio || "Não informado";
      dev[k] = (dev[k] ?? 0) + Number(e.amount);
      if (!nomes.includes(k)) nomes.push(k);
    }
  }
  const devTotal = Object.values(dev).reduce((a, b) => a + b, 0);
  return { nomes, tot, mat, total, count: ap.length, dev, devTotal };
}

/* ── PDF Report ─────────────────────────────────────────────────────── */
function printLedgerReport(
  ledger: LedgerEntry[],
  totals: { entradas: number; saidas: number; saldoPeriodo: number; saldoAcumulado: number },
  storeName: string,
  dateFrom: string,
  dateTo: string,
) {
  const win = window.open("", "_blank");
  if (!win) return;

  const rows = [...ledger].reverse().map(e => `
    <tr>
      <td>${fmtDate(e.date)}</td>
      <td>${e.description}${e.socio ? ` <b style="color:#2563eb">· ${e.socio}</b>` : ""}</td>
      <td>${e.category}</td>
      <td>${SOURCE_LABEL[e.source]}</td>
      <td style="text-align:right;color:${e.type === "entrada" ? "#10b981" : "#ef4444"};font-weight:700">
        ${e.type === "entrada" ? "+" : "-"}${brl(e.amount)}
      </td>
      <td style="text-align:right;font-weight:700">${brl(e.saldo)}</td>
    </tr>`).join("");

  const bycat: Record<string, { entradas: number; saidas: number }> = {};
  ledger.forEach(e => {
    const c = (bycat[e.category] ??= { entradas: 0, saidas: 0 });
    if (e.type === "entrada") c.entradas += Number(e.amount);
    else c.saidas += Number(e.amount);
  });
  const catRows = Object.entries(bycat)
    .sort((a, b) => (b[1].entradas - b[1].saidas) - (a[1].entradas - a[1].saidas))
    .map(([cat, v]) => `
      <tr>
        <td>${cat}</td>
        <td style="text-align:right;color:#10b981">${v.entradas ? brl(v.entradas) : "—"}</td>
        <td style="text-align:right;color:#ef4444">${v.saidas ? brl(v.saidas) : "—"}</td>
        <td style="text-align:right;font-weight:700">${brl(v.entradas - v.saidas)}</td>
      </tr>`).join("");

  const ap = aportesPorSocio(ledger);
  const curto = (n: string) => n === "Loja" || n === "Não informado" ? n : n.split(" ")[0];
  const aporteHtml = ap.count === 0 ? "" : `
    <div class="section-title">Aportes de sócios — quem colocou dinheiro</div>
    <table>
      <thead><tr><th>Sócio</th><th style="text-align:right">Aportou</th><th style="text-align:right">Devolvido (ressarcimento)</th><th style="text-align:right">Líquido</th></tr></thead>
      <tbody>${ap.nomes.map(n => `<tr><td>${n}</td><td style="text-align:right">${brl(ap.tot[n] ?? 0)}</td><td style="text-align:right;color:#b91c1c">${ap.dev[n] ? "-" + brl(ap.dev[n]) : "—"}</td><td style="text-align:right;font-weight:700">${brl((ap.tot[n] ?? 0) - (ap.dev[n] ?? 0))}</td></tr>`).join("")}
        <tr><td style="font-weight:700;background:#f3f4f6">Total</td><td style="text-align:right;font-weight:800;background:#f3f4f6">${brl(ap.total)}</td><td style="text-align:right;background:#f3f4f6;color:#b91c1c">${ap.devTotal ? "-" + brl(ap.devTotal) : "—"}</td><td style="text-align:right;font-weight:800;background:#f3f4f6">${brl(ap.total - ap.devTotal)}</td></tr></tbody>
    </table>
    <div class="section-title">Aportes por mês</div>
    <table>
      <thead><tr><th>Mês</th>${ap.nomes.map(n => `<th style="text-align:right">${curto(n)}</th>`).join("")}<th style="text-align:right">Total</th></tr></thead>
      <tbody>${Object.keys(ap.mat).sort().map(m => `<tr><td>${mesLabel(m)}</td>${ap.nomes.map(n => `<td style="text-align:right">${ap.mat[m][n] ? brl(ap.mat[m][n]) : "—"}</td>`).join("")}<td style="text-align:right;font-weight:700">${brl(Object.values(ap.mat[m]).reduce((a, b) => a + b, 0))}</td></tr>`).join("")}
        <tr><td style="font-weight:700;background:#f3f4f6">Total</td>${ap.nomes.map(n => `<td style="text-align:right;font-weight:700;background:#f3f4f6">${brl(ap.tot[n] ?? 0)}</td>`).join("")}<td style="text-align:right;font-weight:800;background:#f3f4f6">${brl(ap.total)}</td></tr></tbody>
    </table>`;

  const pl = prolaborePorSocio(ledger);
  const plHtml = pl.itens.length === 0 ? "" : `
    <div class="section-title">Comissão / pró-labore por sócio</div>
    <table>
      <thead><tr><th>Sócio</th><th style="text-align:right">Recebeu</th><th style="text-align:right">%</th></tr></thead>
      <tbody>${pl.nomes.map(n => `<tr><td>${n}</td><td style="text-align:right;font-weight:700">${brl(pl.tot[n])}</td><td style="text-align:right">${pl.total ? (pl.tot[n] / pl.total * 100).toFixed(1) : "0"}%</td></tr>`).join("")}
        <tr><td style="font-weight:700;background:#f3f4f6">Total</td><td style="text-align:right;font-weight:800;background:#f3f4f6">${brl(pl.total)}</td><td style="text-align:right;background:#f3f4f6">100%</td></tr></tbody>
    </table>
    <div class="section-title">Comissão / pró-labore por mês</div>
    <table>
      <thead><tr><th>Mês</th>${pl.nomes.map(n => `<th style="text-align:right">${n.split(" ")[0]}</th>`).join("")}<th style="text-align:right">Total</th></tr></thead>
      <tbody>${Object.keys(pl.mat).sort().map(m => `<tr><td>${mesLabel(m)}</td>${pl.nomes.map(n => `<td style="text-align:right">${pl.mat[m][n] ? brl(pl.mat[m][n]) : "—"}</td>`).join("")}<td style="text-align:right;font-weight:700">${brl(Object.values(pl.mat[m]).reduce((a, b) => a + b, 0))}</td></tr>`).join("")}
        <tr><td style="font-weight:700;background:#f3f4f6">Total</td>${pl.nomes.map(n => `<td style="text-align:right;font-weight:700;background:#f3f4f6">${brl(pl.tot[n])}</td>`).join("")}<td style="text-align:right;font-weight:800;background:#f3f4f6">${brl(pl.total)}</td></tr></tbody>
    </table>
    <div class="section-title">Comissão / pró-labore — lançamentos</div>
    <table>
      <thead><tr><th>Data</th><th>Sócio</th><th>Lançamento</th><th>Venda / observação</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${pl.itens.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${socioDoProlabore(e)}</td><td>${e.description}</td><td style="color:#555">${e.notes ?? ""}</td><td style="text-align:right;font-weight:700">${brl(e.amount)}</td></tr>`).join("")}</tbody>
    </table>`;
  const dist = distribuicoes(ledger);
  const distHtml = dist.itens.length === 0 ? "" : `
    <div class="section-title">Distribuição de Lucros — de onde veio</div>
    <table>
      <thead><tr><th>Data</th><th>Lançamento</th><th>De onde veio</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${dist.itens.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${e.description}</td><td style="color:#444">${e.notes || "<span style='color:#d97706'>Origem não informada</span>"}</td><td style="text-align:right;font-weight:700">${brl(e.amount)}</td></tr>`).join("")}
        <tr><td colspan="3" style="font-weight:700;background:#f3f4f6">Total distribuído</td><td style="text-align:right;font-weight:800;background:#f3f4f6">${brl(dist.total)}</td></tr></tbody>
    </table>`;

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Fluxo de Caixa — ${storeName}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;font-size:12px}
      .header{text-align:center;border-bottom:3px solid #10b981;padding-bottom:14px;margin-bottom:20px}
      .header h1{font-size:20px;color:#10b981;font-weight:800}
      .header p{font-size:11px;color:#666;margin-top:4px}
      .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;border-bottom:1px solid #eee;padding-bottom:4px;margin:16px 0 10px}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
      .summary-card{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:10px;text-align:center}
      .summary-card .label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px}
      .summary-card .value{font-size:14px;font-weight:800;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f3f4f6;font-weight:700;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
      td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
      tr:last-child td{border-bottom:none}
      @media print{body{padding:0}}
    </style>
  </head><body>
    <div class="header">
      <h1>${storeName}</h1>
      <p>Relatório de Fluxo de Caixa · Gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
      <p style="margin-top:6px;font-size:10px;color:#999">Período: ${fmtDate(dateFrom)} até ${fmtDate(dateTo)}</p>
    </div>

    <div class="summary">
      <div class="summary-card"><div class="label">Entradas</div><div class="value" style="color:#10b981">${brl(totals.entradas)}</div></div>
      <div class="summary-card"><div class="label">Saídas</div><div class="value" style="color:#ef4444">${brl(totals.saidas)}</div></div>
      <div class="summary-card"><div class="label">Saldo do Filtro</div><div class="value" style="color:${totals.saldoPeriodo >= 0 ? "#10b981" : "#ef4444"}">${brl(totals.saldoPeriodo)}</div></div>
      <div class="summary-card"><div class="label">Saldo Acumulado</div><div class="value" style="color:${totals.saldoAcumulado >= 0 ? "#10b981" : "#ef4444"}">${brl(totals.saldoAcumulado)}</div></div>
    </div>

    ${aporteHtml}
    ${plHtml}
    ${distHtml}

    <div class="section-title">Resumo por Categoria</div>
    <table>
      <thead><tr><th>Categoria</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Líquido</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>

    <div class="section-title">Movimentações</div>
    <table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`);
  win.document.close();
  win.print();
}

export default function FluxoCaixaPage() {
  const { userId } = useUserId();
  const [storeName, setStoreName] = useState("CRM 7Business");

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // ponto zero fixo do fluxo de caixa — histórico anterior não entra no saldo
  const [dateFrom, setDateFrom] = useState("2026-07-01");
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Conta | null>(null);
  const [accountForm, setAccountForm] = useState({ ...EMPTY_ACCOUNT_FORM });
  const [savingAccount, setSavingAccount] = useState(false);

  const [tab, setTab] = useState<"movimentacoes" | "relatorio">("movimentacoes");
  const [filterCategory, setFilterCategory] = useState("todas");
  const [filterSource, setFilterSource] = useState("todos");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ dateFrom, dateTo });
    const res = await fetch(`/api/fluxo-caixa?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLedger(data.ledger ?? []);
      setSummary(data.summary ?? null);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/settings?userId=${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.business_name) setStoreName(d.business_name); })
      .catch(() => {});
  }, [userId]);


  const categoryOptions = useMemo(
    () => Array.from(new Set(ledger.map(e => e.category))).sort((a, b) => a.localeCompare(b)),
    [ledger],
  );

  const filtered = useMemo(() => ledger.filter(e => {
    if (filterCategory !== "todas" && e.category !== filterCategory) return false;
    if (filterSource   !== "todos" && e.source   !== filterSource)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.description.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [ledger, filterCategory, filterSource, search]);

  const filteredReversed = useMemo(() => [...filtered].reverse(), [filtered]);
  const hasFilter = filterCategory !== "todas" || filterSource !== "todos" || search !== "";

  const filteredTotals = useMemo(() => {
    const entradas = filtered.filter(e => e.type === "entrada").reduce((s, e) => s + Number(e.amount), 0);
    const saidas   = filtered.filter(e => e.type === "saida").reduce((s, e) => s + Number(e.amount), 0);
    return { entradas, saidas, liquido: entradas - saidas };
  }, [filtered]);

  function setPeriod(kind: "hoje" | "semana" | "mes" | "mesPassado") {
    const now = new Date();
    if (kind === "hoje") {
      const t = now.toISOString().split("T")[0];
      setDateFrom(t); setDateTo(t);
    } else if (kind === "semana") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setDateFrom(d.toISOString().split("T")[0]);
      setDateTo(now.toISOString().split("T")[0]);
    } else if (kind === "mes") {
      setDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      setDateTo(now.toISOString().split("T")[0]);
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = d.getFullYear(), m = d.getMonth();
      setDateFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`);
      setDateTo(`${y}-${String(m + 1).padStart(2, "0")}-${new Date(y, m + 1, 0).getDate()}`);
    }
  }

  function openNew() {
    setEditingEntry(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEditEntry(e: LedgerEntry) {
    setEditingEntry(e);
    setForm({
      date: e.date, description: e.description, category: e.category,
      amount: String(e.amount), payment_method: "pix", responsavel: "",
      socios: e.socio ? [e.socio] : [], partes: {},
    });
    setShowModal(true);
  }

  const isDespesa = editingEntry?.source === "despesa_loja";
  const baseCategories = isDespesa ? STORE_EXPENSE_CATEGORIES : CATEGORIES;
  const modalCategories = form.category && !baseCategories.includes(form.category)
    ? [form.category, ...baseCategories]
    : baseCategories;

  const isAporteForm = !isDespesa && form.category === APORTE_CATEGORY;
  const totalCent = Math.round(Number(form.amount || 0) * 100);
  // divide o aporte entre os sócios marcados: valor digitado por pessoa, ou partes iguais
  const rateio = useMemo(() => {
    if (!form.socios.length) return [] as { socio: string; cent: number }[];
    const manual = form.socios.filter(x => form.partes[x] !== undefined && form.partes[x] !== "");
    const manualCent = manual.reduce((a, x) => a + Math.round(Number(form.partes[x]) * 100), 0);
    const auto = form.socios.filter(x => !manual.includes(x));
    const resto = totalCent - manualCent;
    const base = auto.length ? Math.floor(resto / auto.length) : 0;
    let sobra = auto.length ? resto - base * auto.length : 0;
    return form.socios.map(x => {
      if (manual.includes(x)) return { socio: x, cent: Math.round(Number(form.partes[x]) * 100) };
      const c = base + sobra;
      sobra = 0;
      return { socio: x, cent: c };
    });
  }, [form.socios, form.partes, totalCent]);
  const aporteOk = !isAporteForm || (rateio.length > 0 && rateio.every(r => r.cent > 0) && rateio.reduce((a, r) => a + r.cent, 0) === totalCent);

  function toggleSocio(n: string) {
    setForm(f => {
      if (f.socios.includes(n)) {
        const partes = { ...f.partes };
        delete partes[n];
        return { ...f, socios: f.socios.filter(x => x !== n), partes };
      }
      if (f.socios.length >= 3) return f;
      return { ...f, socios: [...f.socios, n] };
    });
  }

  async function saveForm() {
    if (!form.description || !form.amount || !form.responsavel || !aporteOk) return;
    setSaving(true);
    const responsavel = form.responsavel;
    const rest = { date: form.date, description: form.description, category: form.category, payment_method: form.payment_method };
    if (isAporteForm) {
      const nota = rateio.length > 1 ? `Aporte dividido entre ${form.socios.join(", ")} (total ${brl(totalCent / 100)})` : null;
      const [primeiro, ...outros] = rateio;
      let ok = true;
      if (editingEntry) {
        const r = await fetch("/api/fluxo-caixa", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingEntry.id, ...rest, socio: primeiro.socio, amount: primeiro.cent / 100, editado_por: responsavel, ...(nota ? { notes: nota } : {}) }),
        });
        ok = r.ok;
      }
      const novos = editingEntry ? outros : rateio;
      for (const l of novos) {
        if (!ok) break;
        const r = await fetch("/api/fluxo-caixa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, socio: l.socio, amount: l.cent / 100, store_id: userId, lancado_por: responsavel, notes: nota }),
        });
        ok = r.ok;
      }
      setSaving(false);
      if (!ok) { alert("Erro ao salvar aporte"); fetchAll(); return; }
      setShowModal(false);
      fetchAll();
      return;
    }
    if (isDespesa && editingEntry) {
      const res = await fetch("/api/financeiro-loja", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id, date: form.date, description: form.description,
          category: form.category, amount: Number(form.amount), editado_por: responsavel,
        }),
      });
      setSaving(false);
      if (!res.ok) { alert("Erro ao salvar despesa"); return; }
      setShowModal(false);
      fetchAll();
      return;
    }
    const res = editingEntry
      ? await fetch("/api/fluxo-caixa", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingEntry.id, ...rest, socio: null, amount: Number(form.amount), editado_por: responsavel }),
        })
      : await fetch("/api/fluxo-caixa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, amount: Number(form.amount), store_id: userId, lancado_por: responsavel }),
        });
    setSaving(false);
    if (!res.ok) { alert(editingEntry ? "Erro ao salvar recebimento" : "Erro ao lançar recebimento"); return; }
    setShowModal(false);
    fetchAll();
  }

  async function deleteEntry(id: string, description?: string) {
    if (!confirm(`Excluir o recebimento${description ? ` "${description}"` : ""}?`)) return;
    await fetch(`/api/fluxo-caixa?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  async function cancelStoreExpense(id: string, description: string) {
    if (!confirm(`Cancelar a despesa "${description}"? Ela some do fluxo de caixa e do Financeiro da Loja.`)) return;
    await fetch(`/api/financeiro-loja?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  function openNewAccount() {
    setEditingAccount(null);
    setAccountForm({ ...EMPTY_ACCOUNT_FORM });
    setShowAccountModal(true);
  }

  function openEditAccount(c: Conta) {
    setEditingAccount(c);
    setAccountForm({ name: c.name, balance: String(c.balance), reference_date: c.referenceDate });
    setShowAccountModal(true);
  }

  async function saveAccount() {
    if (!accountForm.name || accountForm.balance === "") return;
    setSavingAccount(true);
    const payload = { ...accountForm, balance: Number(accountForm.balance), store_id: userId };

    const res = editingAccount
      ? await fetch("/api/bank-accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingAccount.id, ...payload }),
        })
      : await fetch("/api/bank-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSavingAccount(false);
    if (!res.ok) { alert("Erro ao salvar conta"); return; }
    setShowAccountModal(false);
    fetchAll();
  }

  async function deleteAccount(id: string) {
    if (!confirm("Remover esta conta bancária?")) return;
    await fetch(`/api/bank-accounts?id=${id}`, { method: "DELETE" });
    fetchAll();
  }

  const inputStyle = { background: "#111827", borderColor: "#374151" };
  const sectionBg  = { background: "#0f172a", border: "1px solid #1f2937" };
  const TAB_STYLE = (active: boolean) => ({
    background: active ? "rgba(16,185,129,0.15)" : "transparent",
    color:      active ? "#34d399" : "#6b7280",
    borderBottom: active ? "2px solid #10b981" : "2px solid transparent",
  });

  return (
    <main className="min-h-screen p-4 sm:p-6" style={{ background: "#0a0f1a" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">💵 Fluxo de Caixa</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Despesas fixas, lucro das vendas e aportes. A implantação tem caixa próprio em{" "}
            <Link href="/despesas-implantacao" className="underline hover:text-white">Implantação</Link>.</p>
        </div>
        <button onClick={openNew}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
          style={{ background: "#10b981" }}>
          + Recebimento
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "#1f2937" }}>
        {(["movimentacoes", "relatorio"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-semibold transition-all"
            style={TAB_STYLE(tab === t)}>
            {t === "movimentacoes" ? "📋 Movimentações" : "📄 Relatório"}
          </button>
        ))}
      </div>

      {/* Filtros de período */}
      <div className="rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3" style={sectionBg}>
        <div className="flex gap-2">
          {[
            { label: "Hoje", fn: () => setPeriod("hoje") },
            { label: "7 dias", fn: () => setPeriod("semana") },
            { label: "Este mês", fn: () => setPeriod("mes") },
            { label: "Mês passado", fn: () => setPeriod("mesPassado") },
          ].map(a => (
            <button key={a.label} onClick={a.fn}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: "#1f2937", color: "#9ca3af" }}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center ml-auto">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
          <span style={{ color: "#6b7280" }}>até</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Carregando…</div>
      ) : tab === "movimentacoes" ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Entradas do período", value: summary?.entradas ?? 0, color: "#10b981", icon: "📥" },
              { label: "Saídas do período", value: summary?.saidas ?? 0, color: "#ef4444", icon: "📤" },
              { label: "Saldo do período", value: summary?.saldoPeriodo ?? 0, color: (summary?.saldoPeriodo ?? 0) >= 0 ? "#10b981" : "#ef4444", icon: "⚖️" },
              { label: "Saldo acumulado", value: summary?.saldoAcumulado ?? 0, color: (summary?.saldoAcumulado ?? 0) >= 0 ? "#10b981" : "#ef4444", icon: "🏦" },
            ].map(c => (
              <div key={c.label} className="rounded-2xl p-4" style={sectionBg}>
                <p className="text-xl mb-1">{c.icon}</p>
                <p className="text-[11px] font-semibold mb-1" style={{ color: "#6b7280" }}>{c.label}</p>
                <p className="text-xl font-black" style={{ color: c.color }}>{brl(c.value)}</p>
              </div>
            ))}
          </div>

          {/* Contas Bancárias */}
          <div className="rounded-2xl p-5 mb-6" style={sectionBg}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-white">🏦 Contas Bancárias</p>
                <p className="text-[11px]" style={{ color: "#6b7280" }}>
                  Saldo de referência de cada conta — usado para calcular o saldo acumulado real
                </p>
              </div>
              <button onClick={openNewAccount}
                className="rounded-xl px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                style={{ background: "#374151" }}>
                + Conta
              </button>
            </div>
            {!summary?.contas?.length ? (
              <p className="text-sm text-center py-4" style={{ color: "#6b7280" }}>Nenhuma conta cadastrada</p>
            ) : (
              <div className="space-y-2">
                {summary.contas.map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "#111827" }}>
                    <div>
                      <p className="text-sm font-semibold text-white">{c.name}</p>
                      <p className="text-[10px]" style={{ color: "#6b7280" }}>
                        Referência: {fmtDate(c.referenceDate)} · {brl(c.balance)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-base font-black" style={{ color: c.saldoAtual >= 0 ? "#10b981" : "#ef4444" }}>{brl(c.saldoAtual)}</p>
                      <button onClick={() => openEditAccount(c)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                        style={{ background: "#1f2937", color: "#9ca3af" }}>✏️</button>
                      <button onClick={() => deleteAccount(c.id)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                        style={{ background: "#ef444415", color: "#ef4444" }}>🗑️</button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: "#1f2937" }}>
                  <span className="text-xs font-bold" style={{ color: "#9ca3af" }}>Total em contas (hoje)</span>
                  <span className="text-base font-black text-white">{brl(summary.saldoTotalContas)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Filtros das movimentações */}
          <div className="rounded-2xl p-4" style={sectionBg}>
            <div className="flex flex-wrap gap-3 items-center">
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todas">Todas categorias</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todas origens</option>
                {Object.entries(SOURCE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar descrição..."
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none flex-1 min-w-[160px]" style={inputStyle} />
              {hasFilter && (
                <button onClick={() => { setFilterCategory("todas"); setFilterSource("todos"); setSearch(""); }}
                  className="rounded-xl px-3 py-2 text-xs font-semibold"
                  style={{ background: "#1f2937", color: "#9ca3af" }}>
                  Limpar
                </button>
              )}
            </div>
            {hasFilter && (
              <p className="text-xs mt-3" style={{ color: "#9ca3af" }}>
                {filtered.length} lançamento(s) · Entradas {brl(filteredTotals.entradas)} · Saídas {brl(filteredTotals.saidas)}
              </p>
            )}
          </div>

          {/* Ledger */}
          <div className="rounded-2xl overflow-hidden" style={sectionBg}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                  {["Data", "Descrição", "Categoria", "Origem", "Valor", "Saldo", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "#6b7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredReversed.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-600">Nenhuma movimentação no período</td></tr>
                )}
                {filteredReversed.map(e => (
                  <tr key={`${e.source}-${e.id}`} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid #1f293740" }}>
                    <td className="px-4 py-3 text-white">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3 font-semibold text-white">{e.description}
                      {e.socio && <span className="text-xs font-bold" style={{ color: "#60a5fa" }}> · {e.socio}</span>}
                      <LancadoPor lancado={e.lancado_por} editado={e.editado_por} /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{e.category}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#6b7280" }}>{SOURCE_LABEL[e.source]}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: e.type === "entrada" ? "#10b981" : "#ef4444" }}>
                      {e.type === "entrada" ? "+" : "-"}{brl(e.amount)}
                    </td>
                    <td className="px-4 py-3 font-bold text-white">{brl(e.saldo)}</td>
                    <td className="px-4 py-3">
                      {e.source === "recebimento" ? (
                        <div className="flex gap-2">
                          <button onClick={() => openEditEntry(e)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                            style={{ background: "#1f2937", color: "#9ca3af" }}>✏️</button>
                          <button onClick={() => deleteEntry(e.id, e.description)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                            style={{ background: "#ef444415", color: "#ef4444" }}>🗑️</button>
                        </div>
                      ) : e.source === "despesa_loja" ? (
                        <div className="flex gap-2">
                          <button onClick={() => openEditEntry(e)} title="Editar despesa"
                            className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                            style={{ background: "#1f2937", color: "#9ca3af" }}>✏️</button>
                          <button onClick={() => cancelStoreExpense(e.id, e.description)} title="Excluir despesa"
                            className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                            style={{ background: "#ef444415", color: "#ef4444" }}>🗑️</button>
                        </div>
                      ) : e.source === "venda" ? (
                        <Link href="/vendas" title="Corrigir na tela de Vendas (valor da venda, compra e despesas do carro formam o lucro)"
                          className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80 whitespace-nowrap"
                          style={{ background: "#1f2937", color: "#9ca3af" }}>✏️ Vendas</Link>
                      ) : (
                        <span className="text-[10px]" style={{ color: "#374151" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-5">
          {/* Filtros do relatório */}
          <div className="rounded-2xl p-4" style={sectionBg}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#6b7280" }}>Filtros do Relatório</p>
            <div className="flex flex-wrap gap-3">
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todas">Todas categorias</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                <option value="todos">Todas origens</option>
                {Object.entries(SOURCE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button onClick={() => { setFilterCategory("todas"); setFilterSource("todos"); }}
                className="rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "#1f2937", color: "#9ca3af" }}>
                Limpar
              </button>
            </div>
          </div>

          {/* Totais filtrados */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Entradas do filtro", value: filteredTotals.entradas, color: "#10b981" },
              { label: "Saídas do filtro",   value: filteredTotals.saidas,   color: "#ef4444" },
              { label: "Líquido do filtro",  value: filteredTotals.liquido,  color: filteredTotals.liquido >= 0 ? "#10b981" : "#ef4444" },
            ].map(c => (
              <div key={c.label} className="rounded-2xl px-4 py-3" style={sectionBg}>
                <p className="text-[10px] font-semibold" style={{ color: "#6b7280" }}>{c.label}</p>
                <p className="text-lg font-black" style={{ color: c.color }}>{brl(c.value)}</p>
              </div>
            ))}
          </div>

          {/* Aportes por sócio */}
          {(() => {
            const ap = aportesPorSocio(filtered);
            if (!ap.count) return null;
            const curto = (n: string) => n === "Loja" || n === "Não informado" ? n : n.split(" ")[0];
            return (
              <div className="rounded-2xl overflow-hidden" style={sectionBg}>
                <div className="px-4 pt-4 pb-2">
                  <p className="text-sm font-bold text-white">👥 Aportes de sócios</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>Quanto cada um colocou no período: {ap.count} aporte(s), {brl(ap.total)}{ap.devTotal ? ` · devolvido aos sócios (ressarcimento): ${brl(ap.devTotal)}` : ""}</p>
                </div>
                <div className="grid gap-3 px-4 pb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  {ap.nomes.map(n => (
                    <div key={n} className="rounded-xl p-3" style={{ background: "#111827", border: "1px solid #1f2937" }}>
                      <p className="text-[11px] font-semibold" style={{ color: n === "Não informado" ? "#f59e0b" : "#9ca3af" }}>{n}</p>
                      <p className="text-lg font-black text-white">{brl(ap.tot[n] ?? 0)}</p>
                      <p className="text-[10px]" style={{ color: "#6b7280" }}>{ap.total ? ((ap.tot[n] ?? 0) / ap.total * 100).toFixed(1) : "0"}% dos aportes</p>
                      {ap.dev[n] ? (
                        <p className="text-[10px] mt-1" style={{ color: "#f87171" }}>
                          Devolvido (ressarcimento): −{brl(ap.dev[n])}<br />
                          <b className="text-white">Líquido: {brl((ap.tot[n] ?? 0) - ap.dev[n])}</b>
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                        {["Mês", ...ap.nomes.map(curto), "Total"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(ap.mat).sort().map(m => (
                        <tr key={m} style={{ borderBottom: "1px solid #1f293740" }}>
                          <td className="px-4 py-2.5 font-semibold text-white">{mesLabel(m)}</td>
                          {ap.nomes.map(n => (
                            <td key={n} className="px-4 py-2.5" style={{ color: ap.mat[m][n] ? "#10b981" : "#374151" }}>{ap.mat[m][n] ? brl(ap.mat[m][n]) : "—"}</td>
                          ))}
                          <td className="px-4 py-2.5 font-bold text-white">{brl(Object.values(ap.mat[m]).reduce((a, b) => a + b, 0))}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#111827" }}>
                        <td className="px-4 py-2.5 font-bold text-white">Total</td>
                        {ap.nomes.map(n => <td key={n} className="px-4 py-2.5 font-bold text-white">{brl(ap.tot[n] ?? 0)}</td>)}
                        <td className="px-4 py-2.5 font-black text-white">{brl(ap.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Comissão / pró-labore por sócio */}
          {(() => {
            const pl = prolaborePorSocio(filtered);
            if (!pl.itens.length) return null;
            return (
              <div className="rounded-2xl overflow-hidden" style={sectionBg}>
                <div className="px-4 pt-4 pb-2">
                  <p className="text-sm font-bold text-white">💼 Comissão / pró-labore por sócio</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>Quanto cada sócio recebeu no período: {pl.itens.length} lançamento(s), {brl(pl.total)}</p>
                </div>
                <div className="grid gap-3 px-4 pb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  {pl.nomes.map(n => (
                    <div key={n} className="rounded-xl p-3" style={{ background: "#111827", border: "1px solid #1f2937" }}>
                      <p className="text-[11px] font-semibold" style={{ color: n === "Não informado" ? "#f59e0b" : "#9ca3af" }}>{n}</p>
                      <p className="text-lg font-black text-white">{brl(pl.tot[n])}</p>
                      <p className="text-[10px]" style={{ color: "#6b7280" }}>{pl.total ? (pl.tot[n] / pl.total * 100).toFixed(1) : "0"}% do total</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                        {["Mês", ...pl.nomes.map(n => n.split(" ")[0]), "Total"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(pl.mat).sort().map(m => (
                        <tr key={m} style={{ borderBottom: "1px solid #1f293740" }}>
                          <td className="px-4 py-2.5 font-semibold text-white">{mesLabel(m)}</td>
                          {pl.nomes.map(n => (
                            <td key={n} className="px-4 py-2.5" style={{ color: pl.mat[m][n] ? "#f59e0b" : "#374151" }}>{pl.mat[m][n] ? brl(pl.mat[m][n]) : "—"}</td>
                          ))}
                          <td className="px-4 py-2.5 font-bold text-white">{brl(Object.values(pl.mat[m]).reduce((a, b) => a + b, 0))}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#111827" }}>
                        <td className="px-4 py-2.5 font-bold text-white">Total</td>
                        {pl.nomes.map(n => <td key={n} className="px-4 py-2.5 font-bold text-white">{brl(pl.tot[n])}</td>)}
                        <td className="px-4 py-2.5 font-black text-white">{brl(pl.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <details className="px-4 py-3" style={{ borderTop: "1px solid #1f2937" }}>
                  <summary className="text-xs font-semibold cursor-pointer" style={{ color: "#9ca3af" }}>Ver os {pl.itens.length} lançamentos</summary>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-xs">
                      <tbody>
                        {pl.itens.map(e => (
                          <tr key={e.id} style={{ borderBottom: "1px solid #1f293740" }}>
                            <td className="py-2 pr-3 text-white whitespace-nowrap">{fmtDate(e.date)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap" style={{ color: "#60a5fa" }}>{socioDoProlabore(e)}</td>
                            <td className="py-2 pr-3 text-white">{e.description}</td>
                            <td className="py-2 pr-3" style={{ color: "#9ca3af" }}>{e.notes ?? ""}</td>
                            <td className="py-2 text-right font-bold whitespace-nowrap" style={{ color: "#f59e0b" }}>{brl(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            );
          })()}

          {/* Distribuição de lucros: de onde veio */}
          {(() => {
            const dist = distribuicoes(filtered);
            if (!dist.itens.length) return null;
            return (
              <div className="rounded-2xl overflow-hidden" style={sectionBg}>
                <div className="px-4 pt-4 pb-2">
                  <p className="text-sm font-bold text-white">💸 Distribuição de Lucros — de onde veio</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>{dist.itens.length} lançamento(s), {brl(dist.total)} no período. A origem vem da observação de cada lançamento.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                        {["Data", "Lançamento", "De onde veio", "Valor"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dist.itens.map(e => (
                        <tr key={e.id} style={{ borderBottom: "1px solid #1f293740" }}>
                          <td className="px-4 py-2.5 text-white whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="px-4 py-2.5 font-semibold text-white">{e.description}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: e.notes ? "#9ca3af" : "#f59e0b", minWidth: 220 }}>{e.notes || "Origem não informada: escreva na observação do lançamento em Fin. da Loja"}</td>
                          <td className="px-4 py-2.5 font-bold whitespace-nowrap" style={{ color: "#f87171" }}>{brl(e.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#111827" }}>
                        <td className="px-4 py-2.5 font-bold text-white" colSpan={3}>Total distribuído</td>
                        <td className="px-4 py-2.5 font-black text-white whitespace-nowrap">{brl(dist.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Resumo por categoria */}
          <div className="rounded-2xl overflow-hidden" style={sectionBg}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                  {["Categoria", "Entradas", "Saídas", "Líquido"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "#6b7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const bycat: Record<string, { entradas: number; saidas: number }> = {};
                  filtered.forEach(e => {
                    const c = (bycat[e.category] ??= { entradas: 0, saidas: 0 });
                    if (e.type === "entrada") c.entradas += Number(e.amount);
                    else c.saidas += Number(e.amount);
                  });
                  const items = Object.entries(bycat).sort((a, b) => (b[1].entradas - b[1].saidas) - (a[1].entradas - a[1].saidas));
                  if (!items.length) return (
                    <tr><td colSpan={4} className="text-center py-12 text-gray-600">Nenhum dado no filtro</td></tr>
                  );
                  return items.map(([cat, v]) => (
                    <tr key={cat} style={{ borderBottom: "1px solid #1f293740" }}>
                      <td className="px-4 py-3 font-semibold text-white">{cat}</td>
                      <td className="px-4 py-3" style={{ color: "#10b981" }}>{v.entradas ? brl(v.entradas) : "—"}</td>
                      <td className="px-4 py-3" style={{ color: "#ef4444" }}>{v.saidas ? brl(v.saidas) : "—"}</td>
                      <td className="px-4 py-3 font-bold text-white">{brl(v.entradas - v.saidas)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          {/* Botão de impressão */}
          <button
            onClick={() => printLedgerReport(filtered, {
              entradas: filteredTotals.entradas,
              saidas: filteredTotals.saidas,
              saldoPeriodo: filteredTotals.liquido,
              saldoAcumulado: summary?.saldoAcumulado ?? 0,
            }, storeName, dateFrom, dateTo)}
            className="w-full rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 hover:opacity-90"
            style={{ background: "#10b981" }}>
            🖨️ Imprimir Relatório
          </button>
        </div>
      )}

      {/* Modal Novo Recebimento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-base font-black text-white">{isDespesa ? "✏️ Editar Despesa" : editingEntry ? "✏️ Editar Recebimento" : "➕ Novo Recebimento"}</h2>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                style={{ background: "#1f2937" }}>✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data</label>
                <input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Descrição *</label>
                <input type="text" placeholder="Ex: Comissão de indicação" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-green-500" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Categoria</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                    {isDespesa ? (
                      modalCategories.map(c => <option key={c} value={c}>{c}</option>)
                    ) : (
                      <>
                        <optgroup label="Recebimento">
                          {modalCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                        <optgroup label="Outras áreas">
                          {STORE_EXPENSE_CATEGORIES.filter(c => !modalCategories.includes(c))
                            .map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor (R$) *</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-green-500" style={inputStyle} />
                </div>
              </div>
              {isAporteForm && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold" style={{ color: "#6b7280" }}>Quem aportou * (marque até 3)</label>
                  <div className="flex flex-wrap gap-2">
                    {SOCIOS_APORTE.map(n => {
                      const on = form.socios.includes(n);
                      return (
                        <button key={n} type="button" onClick={() => toggleSocio(n)} aria-pressed={on}
                          className="rounded-full px-3 py-1.5 text-xs font-semibold"
                          style={{ background: on ? "#3b82f6" : "#1f2937", color: on ? "#fff" : "#9ca3af", border: `1px solid ${on ? "#3b82f6" : "#374151"}` }}>
                          {on ? "✓ " : ""}{n}
                        </button>
                      );
                    })}
                  </div>
                  {form.socios.length > 1 && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                      <p className="text-[10px] font-semibold" style={{ color: "#6b7280" }}>Quanto cada um colocou. Deixe em branco para dividir igual.</p>
                      {rateio.map((r, idx) => (
                        <div key={r.socio} className="flex items-center gap-3">
                          <span className="text-xs text-white flex-1 min-w-0 truncate">{r.socio}</span>
                          <input id={`fc-parte-${idx}`} type="number" min="0" step="0.01" aria-label={`Valor de ${r.socio}`}
                            placeholder={(r.cent / 100).toFixed(2)} value={form.partes[r.socio] ?? ""}
                            onChange={ev => setForm(f => ({ ...f, partes: { ...f.partes, [r.socio]: ev.target.value } }))}
                            className="w-32 rounded-xl px-3 py-1.5 text-sm text-white border focus:outline-none text-right" style={inputStyle} />
                        </div>
                      ))}
                      {!aporteOk && totalCent > 0 && (
                        <p className="text-[11px]" style={{ color: "#f87171" }}>
                          A soma das partes ({brl(rateio.reduce((a, r) => a + r.cent, 0) / 100)}) precisa ser igual ao valor ({brl(totalCent / 100)}).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!isDespesa && <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Forma de Recebimento</label>
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                  {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>}
              <ResponsavelPicker label={editingEntry ? "Editado por" : "Lançado por"} value={form.responsavel}
                onChange={v => setForm(f => ({ ...f, responsavel: v }))} />
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={saveForm} disabled={saving || !form.description || !form.amount || !form.responsavel || !aporteOk}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#10b981" }}>
                {saving ? "Salvando…" : editingEntry ? "✓ Salvar Alterações" : "✓ Lançar Recebimento"}
              </button>
              <button onClick={() => setShowModal(false)}
                className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: "#1f2937", color: "#9ca3af" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conta Bancária */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowAccountModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-base font-black text-white">
                {editingAccount ? "✏️ Editar Conta" : "🏦 Nova Conta Bancária"}
              </h2>
              <button onClick={() => setShowAccountModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white"
                style={{ background: "#1f2937" }}>✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Nome da Conta *</label>
                <input type="text" placeholder="Ex: Banco do Brasil, Caixa da Loja" value={accountForm.name}
                  onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-blue-500" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Saldo Atual (R$) *</label>
                  <input type="number" step="0.01" placeholder="0,00" value={accountForm.balance}
                    onChange={e => setAccountForm(f => ({ ...f, balance: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-blue-500" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data de Referência</label>
                  <input type="date" value={accountForm.reference_date}
                    onChange={e => setAccountForm(f => ({ ...f, reference_date: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
                </div>
              </div>
              <p className="text-[10px]" style={{ color: "#6b7280" }}>
                Informe o saldo que essa conta tinha na data de referência. O sistema soma automaticamente as entradas e saídas lançadas depois dessa data.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={saveAccount} disabled={savingAccount || !accountForm.name || accountForm.balance === ""}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#374151" }}>
                {savingAccount ? "Salvando…" : editingAccount ? "✓ Salvar Alterações" : "✓ Cadastrar Conta"}
              </button>
              <button onClick={() => setShowAccountModal(false)}
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
