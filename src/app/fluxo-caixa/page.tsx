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

export default function FluxoCaixaPage() {
  const { userId } = useUserId();

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

  const reversed = useMemo(() => [...ledger].reverse(), [ledger]);

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
      ) : (
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
