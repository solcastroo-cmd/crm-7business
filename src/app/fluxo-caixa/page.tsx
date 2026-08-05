"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useUserId } from "@/hooks/useUserId";

/* ── Types ─────────────────────────────────────────────────────────── */
type LedgerEntry = {
  id: string;
  date: string;
  type: "entrada" | "saida";
  description: string;
  category: string;
  amount: number;
  source: "venda" | "recebimento" | "despesa_loja" | "despesa_veiculo" | "despesa_implantacao";
  saldo: number;
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
  "Comissão", "Aluguel Recebido", "Serviço Avulso", "Reembolso", "Outros",
];

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "cartao", label: "Cartão" },
];

const SOURCE_LABEL: Record<string, string> = {
  venda: "Venda", recebimento: "Recebimento", despesa_loja: "Despesa Loja", despesa_veiculo: "Despesa Veículo",
  despesa_implantacao: "Despesa Implantação",
};

const EMPTY_FORM = {
  date: new Date().toISOString().split("T")[0],
  description: "", category: CATEGORIES[0],
  amount: "", payment_method: "pix",
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
      <td>${e.description}</td>
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

  const reversed = useMemo(() => [...ledger].reverse(), [ledger]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(ledger.map(e => e.category))).sort((a, b) => a.localeCompare(b)),
    [ledger],
  );

  const filtered = useMemo(() => ledger.filter(e => {
    if (filterCategory !== "todas" && e.category !== filterCategory) return false;
    if (filterSource   !== "todos" && e.source   !== filterSource)   return false;
    return true;
  }), [ledger, filterCategory, filterSource]);

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
      amount: String(e.amount), payment_method: "pix",
    });
    setShowModal(true);
  }

  async function saveForm() {
    if (!form.description || !form.amount) return;
    setSaving(true);
    const res = editingEntry
      ? await fetch("/api/fluxo-caixa", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingEntry.id, ...form, amount: Number(form.amount) }),
        })
      : await fetch("/api/fluxo-caixa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, amount: Number(form.amount), store_id: userId }),
        });
    setSaving(false);
    if (!res.ok) { alert(editingEntry ? "Erro ao salvar recebimento" : "Erro ao lançar recebimento"); return; }
    setShowModal(false);
    fetchAll();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Excluir este recebimento?")) return;
    await fetch(`/api/fluxo-caixa?id=${id}`, { method: "DELETE" });
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
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Entradas, saídas e saldo em tempo real</p>
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
                {reversed.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-600">Nenhuma movimentação no período</td></tr>
                )}
                {reversed.map(e => (
                  <tr key={`${e.source}-${e.id}`} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid #1f293740" }}>
                    <td className="px-4 py-3 text-white">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3 font-semibold text-white">{e.description}</td>
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
                          <button onClick={() => deleteEntry(e.id)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80"
                            style={{ background: "#ef444415", color: "#ef4444" }}>🗑️</button>
                        </div>
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
              <h2 className="text-base font-black text-white">{editingEntry ? "✏️ Editar Recebimento" : "➕ Novo Recebimento"}</h2>
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
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor (R$) *</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:border-green-500" style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Forma de Recebimento</label>
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle}>
                  {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={saveForm} disabled={saving || !form.description || !form.amount}
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
