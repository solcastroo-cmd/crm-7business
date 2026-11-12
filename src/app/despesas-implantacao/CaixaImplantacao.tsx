"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ResponsavelPicker, LancadoPor, RESPONSAVEIS } from "@/components/ResponsavelPicker";

/*
 * Caixa da Implantação — um segundo caixa, separado do Fluxo de Caixa.
 * Entradas: dinheiro da loja (lucro / distribuição) e aportes de sócios.
 * Saídas: só as baixas das despesas de implantação (parcelas de cartão e pix pagos).
 */

export type DespesaCaixa = {
  id: string;
  descricao: string;
  valor: number;
  data_despesa: string;
  forma_pagamento?: string;
  parcelas?: number;
  valor_parcela?: number;
  data_vencimento?: string;
  parcelas_pagas?: number[];
};

type Entrada = {
  id: string;
  loja_id: string;
  data: string;
  origem: "aporte_socio" | "venda_loja" | "outro";
  socio?: string | null;
  descricao: string;
  valor: number;
  observacao?: string | null;
  lancado_por?: string | null;
  editado_por?: string | null;
};

type Parcela<T> = { date: string; valor: number; label: string; parcela: number; total: number; paga: boolean; despesa: T };

const ORIGEM_LABEL: Record<Entrada["origem"], string> = {
  aporte_socio: "Aporte de sócio",
  venda_loja: "Loja (lucro / distribuição)",
  outro: "Outro",
};

const PAGTO_CURTO: Record<string, string> = {
  cartao_credito: "Cartão", cartao_debito: "Débito", pix: "PIX", avista: "À vista",
  boleto: "Boleto", transferencia: "Transferência", financiado: "Financiado", outros: "Outros",
};

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
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
}

function parcelasDe<T extends DespesaCaixa>(d: T): Parcela<T>[] {
  const total = d.parcelas ?? 1;
  const pagas = d.parcelas_pagas ?? [];
  if (d.forma_pagamento === "cartao_credito" && d.data_vencimento && total > 1) {
    const vp = d.valor_parcela ?? Number(d.valor) / total;
    return Array.from({ length: total }, (_, i) => ({
      date: addMonths(d.data_vencimento!, i), valor: Number(vp), label: d.descricao,
      parcela: i + 1, total, paga: pagas.includes(i + 1), despesa: d,
    }));
  }
  const date = d.forma_pagamento === "cartao_credito" && d.data_vencimento ? d.data_vencimento : d.data_despesa;
  return [{ date, valor: Number(d.valor), label: d.descricao, parcela: 1, total: 1, paga: pagas.includes(1), despesa: d }];
}

const EMPTY = {
  data: new Date().toISOString().split("T")[0],
  origem: "venda_loja" as Entrada["origem"],
  socios: [] as string[],
  partes: {} as Record<string, string>,
  descricao: "",
  valor: "",
  observacao: "",
  responsavel: "",
};

export default function CaixaImplantacao<T extends DespesaCaixa>({
  despesas, userId, onBaixa,
}: {
  despesas: T[];
  userId: string | null;
  onBaixa: (d: T, parcela: number) => void;
}) {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Entrada | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [verTodosPagos, setVerTodosPagos] = useState(false);

  const fetchEntradas = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/despesas-implantacao/entradas");
    if (res.ok) setEntradas(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { fetchEntradas(); }, [fetchEntradas]);

  const parcelas = useMemo(
    () => despesas.flatMap(d => parcelasDe(d)).sort((a, b) => a.date.localeCompare(b.date)),
    [despesas],
  );
  const pagos = useMemo(() => parcelas.filter(p => p.paga), [parcelas]);
  const pendentes = useMemo(() => parcelas.filter(p => !p.paga), [parcelas]);

  const kpi = useMemo(() => {
    const entr = entradas.reduce((s, e) => s + Number(e.valor), 0);
    const pago = pagos.reduce((s, p) => s + p.valor, 0);
    const aPagar = pendentes.reduce((s, p) => s + p.valor, 0);
    const pagoCartao = pagos.filter(p => p.despesa.forma_pagamento === "cartao_credito").reduce((s, p) => s + p.valor, 0);
    return { entr, pago, aPagar, saldo: entr - pago, pagoCartao, pagoOutros: pago - pagoCartao };
  }, [entradas, pagos, pendentes]);

  const porSocio = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entradas) {
      const k = e.origem === "venda_loja" ? "Loja (lucro / distribuição)" : (e.socio || (e.origem === "outro" ? "Outro" : "Sócio não informado"));
      m[k] = (m[k] ?? 0) + Number(e.valor);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [entradas]);

  // mês a mês: quanto saiu (pago), quanto entrou e o saldo acumulado; meses futuros mostram o que vence
  const meses = useMemo(() => {
    const m: Record<string, { pago: number; entrada: number; aVencer: number }> = {};
    const add = (k: string) => { if (!m[k]) m[k] = { pago: 0, entrada: 0, aVencer: 0 }; return m[k]; };
    for (const p of pagos) add(p.date.slice(0, 7)).pago += p.valor;
    for (const p of pendentes) add(p.date.slice(0, 7)).aVencer += p.valor;
    for (const e of entradas) add(e.data.slice(0, 7)).entrada += Number(e.valor);
    let acc = 0;
    return Object.keys(m).sort().map(k => {
      acc += m[k].entrada - m[k].pago;
      return { mes: k, ...m[k], saldoMes: m[k].entrada - m[k].pago, acumulado: acc };
    });
  }, [pagos, pendentes, entradas]);

  // extrato: entradas (+) e pagamentos (−) em ordem de data, com saldo corrido
  const extrato = useMemo(() => {
    const linhas = [
      ...entradas.map(e => ({ date: e.data, tipo: "entrada" as const, valor: Number(e.valor), entrada: e, pag: null as Parcela<T> | null })),
      ...pagos.map(p => ({ date: p.date, tipo: "saida" as const, valor: p.valor, entrada: null as Entrada | null, pag: p })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.tipo === "entrada" ? -1 : 1));
    let s = 0;
    return linhas.map(l => { s += l.tipo === "entrada" ? l.valor : -l.valor; return { ...l, saldo: s }; });
  }, [entradas, pagos]);

  const pendentesPorMes = useMemo(() => {
    const m: Record<string, Parcela<T>[]> = {};
    for (const p of pendentes) (m[p.date.slice(0, 7)] ??= []).push(p);
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pendentes]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setErro("");
    setShowModal(true);
  }
  function openEdit(e: Entrada) {
    setEditing(e);
    setForm({
      data: e.data, origem: e.origem, socios: e.socio ? [e.socio] : [], partes: {}, descricao: e.descricao,
      valor: String(e.valor), observacao: e.observacao ?? "", responsavel: "",
    });
    setErro("");
    setShowModal(true);
  }

  const MAX_SOCIOS = 3;
  const isAporte = form.origem === "aporte_socio";
  const totalCent = Math.round(Number(form.valor || 0) * 100);

  // divide o total entre os sócios marcados: valor digitado por pessoa, ou partes iguais
  // (os centavos que sobram ficam com o primeiro sem valor digitado)
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
  const rateioOk = !isAporte || (rateio.length > 0 && rateio.every(r => r.cent > 0) && rateio.reduce((a, r) => a + r.cent, 0) === totalCent);

  function toggleSocio(n: string) {
    setForm(f => {
      if (editing) return { ...f, socios: [n], partes: {} };
      if (f.socios.includes(n)) {
        const partes = { ...f.partes };
        delete partes[n];
        return { ...f, socios: f.socios.filter(x => x !== n), partes };
      }
      if (f.socios.length >= MAX_SOCIOS) return f;
      return { ...f, socios: [...f.socios, n] };
    });
  }

  const podeSalvar = !!form.descricao && totalCent > 0 && !!form.responsavel && rateioOk;

  async function save() {
    if (!podeSalvar || !userId) return;
    setSaving(true);
    setErro("");
    const base = {
      loja_id: userId, data: form.data, origem: form.origem,
      descricao: form.descricao, observacao: form.observacao || null,
      ...(editing ? { editado_por: form.responsavel } : { lancado_por: form.responsavel }),
    };
    let ok = true;
    if (editing) {
      const res = await fetch("/api/despesas-implantacao/entradas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...base, socio: isAporte ? form.socios[0] : null, valor: totalCent / 100 }),
      });
      ok = res.ok;
    } else {
      const nota = rateio.length > 1 ? `Aporte dividido entre ${form.socios.join(", ")} (total ${brl(totalCent / 100)})` : "";
      const linhas = isAporte
        ? rateio.map(r => ({
            ...base, socio: r.socio, valor: r.cent / 100,
            observacao: [form.observacao, nota].filter(Boolean).join(" · ") || null,
          }))
        : [{ ...base, socio: null, valor: totalCent / 100 }];
      for (const l of linhas) {
        const res = await fetch("/api/despesas-implantacao/entradas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(l),
        });
        if (!res.ok) { ok = false; break; }
      }
    }
    setSaving(false);
    if (!ok) { setErro("Não foi possível salvar a entrada. Confira os campos e tente de novo."); fetchEntradas(); return; }
    setShowModal(false);
    fetchEntradas();
  }

  async function remove(id: string) {
    await fetch(`/api/despesas-implantacao/entradas?id=${id}`, { method: "DELETE" });
    setConfirmDel(null);
    fetchEntradas();
  }

  const inputStyle = { background: "#111827", borderColor: "#374151" };
  const sectionBg = { background: "#0f172a", border: "1px solid #1f2937" };
  const th = "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider";
  const pagosVisiveis = verTodosPagos ? [...pagos].reverse() : [...pagos].reverse().slice(0, 15);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-4 text-xs leading-relaxed" style={{ ...sectionBg, color: "#9ca3af" }}>
        Este é o <b className="text-white">caixa da implantação</b>, separado do Fluxo de Caixa. Entram aqui o dinheiro da loja (lucro que seria
        distribuído) e, se houver, aportes de sócios. Saem só as baixas das despesas de implantação: parcelas de cartão e PIX pagos.
        Para dar baixa, use a lista <b className="text-white">A pagar</b> abaixo ou a aba Despesas.
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Entradas (loja + aportes)", value: kpi.entr, color: "#10b981", sub: `${entradas.length} lançamento(s)` },
          { label: "Pagamentos realizados", value: kpi.pago, color: "#f87171", sub: `Cartão ${brl(kpi.pagoCartao)} · PIX e outros ${brl(kpi.pagoOutros)}` },
          { label: "Saldo do caixa", value: kpi.saldo, color: kpi.saldo >= 0 ? "#10b981" : "#ef4444", sub: kpi.saldo >= 0 ? "Entradas cobrem os pagamentos" : "Faltam entradas para cobrir o que já foi pago" },
          { label: "A pagar (cartão pendente)", value: kpi.aPagar, color: "#3b82f6", sub: `${pendentes.length} parcela(s)` },
        ].map(c => (
          <div key={c.label} className="rounded-2xl p-4" style={sectionBg}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "#6b7280" }}>{c.label}</p>
            <p className="text-xl font-black" style={{ color: c.color }}>{brl(c.value)}</p>
            <p className="text-[10px] mt-1" style={{ color: "#6b7280" }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Mês a mês */}
      <div className="rounded-2xl overflow-hidden" style={sectionBg}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-white">📅 Mês a mês</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>Quanto foi pago em cada mês e quanto a loja colocou para cobrir. A coluna A vencer mostra quanto vai sair nos próximos meses.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                {["Mês", "Pago no mês", "A vencer", "Entradas", "Saldo do mês", "Saldo acumulado"].map(h => (
                  <th key={h} className={th} style={{ color: "#6b7280" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meses.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: "#6b7280" }}>Nenhum pagamento ou entrada ainda</td></tr>
              )}
              {meses.map(m => (
                <tr key={m.mes} style={{ borderBottom: "1px solid #1f293740" }}>
                  <td className="px-4 py-2.5 font-semibold text-white">{monthLabel(m.mes)}</td>
                  <td className="px-4 py-2.5" style={{ color: m.pago ? "#f87171" : "#374151" }}>{m.pago ? brl(m.pago) : "—"}</td>
                  <td className="px-4 py-2.5" style={{ color: m.aVencer ? "#60a5fa" : "#374151" }}>{m.aVencer ? brl(m.aVencer) : "—"}</td>
                  <td className="px-4 py-2.5" style={{ color: m.entrada ? "#10b981" : "#374151" }}>{m.entrada ? brl(m.entrada) : "—"}</td>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: m.saldoMes >= 0 ? "#10b981" : "#ef4444" }}>{brl(m.saldoMes)}</td>
                  <td className="px-4 py-2.5 font-bold" style={{ color: m.acumulado >= 0 ? "#fff" : "#ef4444" }}>{brl(m.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entradas + por sócio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={sectionBg}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <div>
              <p className="text-sm font-bold text-white">💵 Entradas do caixa</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>Dinheiro da loja (lucro / distribuição) e aportes de sócios</p>
            </div>
            <button onClick={openNew} className="rounded-xl px-4 py-2 text-xs font-bold text-white hover:opacity-90" style={{ background: "#10b981" }}>
              + Nova entrada
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                  {["Data", "Descrição", "Origem", "Valor", "Ações"].map(h => <th key={h} className={th} style={{ color: "#6b7280" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="text-center py-8" style={{ color: "#6b7280" }}>Carregando…</td></tr>}
                {!loading && entradas.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 px-4" style={{ color: "#6b7280" }}>
                    Nenhuma entrada ainda. Lance o dinheiro da loja que pagou cada mês e, se houver, os aportes de sócios.
                  </td></tr>
                )}
                {[...entradas].reverse().map(e => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #1f293740" }}>
                    <td className="px-4 py-2.5 text-white whitespace-nowrap">{fmtDate(e.data)}</td>
                    <td className="px-4 py-2.5 text-white font-semibold">{e.descricao}
                      <LancadoPor lancado={e.lancado_por} editado={e.editado_por} />
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#9ca3af" }}>
                      {ORIGEM_LABEL[e.origem]}{e.socio ? ` · ${e.socio}` : ""}
                    </td>
                    <td className="px-4 py-2.5 font-bold whitespace-nowrap" style={{ color: "#10b981" }}>+{brl(Number(e.valor))}</td>
                    <td className="px-4 py-2.5">
                      {confirmDel === e.id ? (
                        <div className="flex gap-2 items-center">
                          <span className="text-[11px]" style={{ color: "#f87171" }}>Excluir?</span>
                          <button onClick={() => remove(e.id)} className="rounded-lg px-2 py-1 text-xs font-bold" style={{ background: "#ef4444", color: "#fff" }}>Sim</button>
                          <button onClick={() => setConfirmDel(null)} className="rounded-lg px-2 py-1 text-xs" style={{ background: "#1f2937", color: "#9ca3af" }}>Não</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(e)} className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80" style={{ background: "#1f2937", color: "#9ca3af" }} title="Editar">✏️</button>
                          <button onClick={() => setConfirmDel(e.id)} className="rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-80" style={{ background: "#ef444415", color: "#ef4444" }} title="Excluir">🗑️</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl p-4" style={sectionBg}>
          <p className="text-sm font-bold text-white mb-3">👥 Quem colocou dinheiro</p>
          {porSocio.length === 0 ? (
            <p className="text-xs" style={{ color: "#6b7280" }}>As entradas aparecem aqui somadas: loja e cada sócio.</p>
          ) : (
            <div className="space-y-3">
              {porSocio.map(([nome, v]) => (
                <div key={nome}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white font-semibold">{nome}</span>
                    <span style={{ color: "#9ca3af" }}>{brl(v)} · {kpi.entr ? Math.round(v / kpi.entr * 100) : 0}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "#1f2937" }}>
                    <div className="h-2 rounded-full" style={{ width: `${kpi.entr ? v / kpi.entr * 100 : 0}%`, background: "#10b981" }} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-xs pt-2 border-t" style={{ borderColor: "#1f2937" }}>
                <span style={{ color: "#9ca3af" }}>Total</span>
                <span className="text-white font-bold">{brl(kpi.entr)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagamentos realizados (segunda tabela) */}
      <div className="rounded-2xl overflow-hidden" style={sectionBg}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-white">✅ Pagamentos realizados</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>Parcelas de cartão e PIX com baixa dada, a saída deste caixa</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #1f2937", background: "#111827" }}>
                {["Data", "Despesa", "Forma", "Parcela", "Valor", "Saldo do caixa"].map(h => <th key={h} className={th} style={{ color: "#6b7280" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pagos.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: "#6b7280" }}>Nenhum pagamento com baixa dada</td></tr>}
              {pagosVisiveis.map(p => {
                const saldo = extrato.find(l => l.pag === p)?.saldo ?? 0;
                return (
                  <tr key={`${p.despesa.id}-${p.parcela}`} style={{ borderBottom: "1px solid #1f293740" }}>
                    <td className="px-4 py-2.5 text-white whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5 text-white">{p.label}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#9ca3af" }}>{PAGTO_CURTO[p.despesa.forma_pagamento ?? "avista"] ?? p.despesa.forma_pagamento}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#9ca3af" }}>{p.total > 1 ? `${p.parcela}/${p.total}` : "única"}</td>
                    <td className="px-4 py-2.5 font-bold whitespace-nowrap" style={{ color: "#f87171" }}>−{brl(p.valor)}</td>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: saldo >= 0 ? "#fff" : "#ef4444" }}>{brl(saldo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagos.length > 15 && (
          <button onClick={() => setVerTodosPagos(v => !v)} className="w-full py-3 text-xs font-semibold" style={{ color: "#9ca3af", borderTop: "1px solid #1f2937" }}>
            {verTodosPagos ? "Mostrar só os 15 mais recentes" : `Ver todos os ${pagos.length} pagamentos`}
          </button>
        )}
      </div>

      {/* A pagar */}
      <div className="rounded-2xl overflow-hidden" style={sectionBg}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-white">⏳ A pagar</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>Parcelas ainda sem baixa, por mês de vencimento. Clique em Dar baixa quando pagar.</p>
        </div>
        {pendentesPorMes.length === 0 && <p className="text-center py-8 text-sm" style={{ color: "#6b7280" }}>Nada pendente</p>}
        {pendentesPorMes.map(([mes, itens]) => (
          <div key={mes} style={{ borderTop: "1px solid #1f2937" }}>
            <div className="flex justify-between px-4 py-2" style={{ background: "#111827" }}>
              <span className="text-xs font-bold text-white">{monthLabel(mes)}</span>
              <span className="text-xs font-bold" style={{ color: "#60a5fa" }}>{brl(itens.reduce((s, i) => s + i.valor, 0))}</span>
            </div>
            {itens.map(i => (
              <div key={`${i.despesa.id}-${i.parcela}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm" style={{ borderTop: "1px solid #1f293740" }}>
                <div className="min-w-0">
                  <p className="text-white truncate">{i.label}</p>
                  <p className="text-[11px]" style={{ color: "#6b7280" }}>
                    {fmtDate(i.date)} · {PAGTO_CURTO[i.despesa.forma_pagamento ?? "avista"] ?? i.despesa.forma_pagamento}{i.total > 1 ? ` · parcela ${i.parcela}/${i.total}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold" style={{ color: "#60a5fa" }}>{brl(i.valor)}</span>
                  <button onClick={() => onBaixa(i.despesa, i.parcela)} className="rounded-lg px-3 py-1 text-xs font-bold hover:opacity-80" style={{ background: "#10b98120", color: "#10b981" }}>
                    Dar baixa
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Modal entrada */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          onClick={ev => { if (ev.target === ev.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid #1f2937" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #1f2937" }}>
              <h2 className="text-base font-black text-white">{editing ? "✏️ Editar entrada" : "➕ Nova entrada no caixa da implantação"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white" style={{ background: "#1f2937" }}>✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>De onde veio o dinheiro *</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(ORIGEM_LABEL) as Entrada["origem"][]).map(o => (
                    <button key={o} type="button" onClick={() => setForm(f => ({ ...f, origem: o }))}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{ background: form.origem === o ? "#10b981" : "#1f2937", color: form.origem === o ? "#fff" : "#9ca3af", border: `1px solid ${form.origem === o ? "#10b981" : "#374151"}` }}>
                      {ORIGEM_LABEL[o]}
                    </button>
                  ))}
                </div>
              </div>
              {isAporte && (
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>
                    {editing ? "Sócio *" : `Sócios * (marque até ${MAX_SOCIOS})`}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RESPONSAVEIS.map(n => {
                      const on = form.socios.includes(n);
                      const bloqueado = !on && !editing && form.socios.length >= MAX_SOCIOS;
                      return (
                        <button key={n} type="button" onClick={() => toggleSocio(n)} disabled={bloqueado}
                          aria-pressed={on}
                          className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                          style={{ background: on ? "#3b82f6" : "#1f2937", color: on ? "#fff" : "#9ca3af", border: `1px solid ${on ? "#3b82f6" : "#374151"}` }}>
                          {on ? "✓ " : ""}{n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ci-data" className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Data</label>
                  <input id="ci-data" type="date" value={form.data} onChange={ev => setForm(f => ({ ...f, data: ev.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="ci-valor" className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Valor (R$) *</label>
                  <input id="ci-valor" type="number" min="0" step="0.01" placeholder="0,00" value={form.valor} onChange={ev => setForm(f => ({ ...f, valor: ev.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
                </div>
              </div>
              {isAporte && !editing && form.socios.length > 1 && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "#0f172a", border: "1px solid #1f2937" }}>
                  <p className="text-[10px] font-semibold" style={{ color: "#6b7280" }}>
                    Quanto cada um colocou. Deixe em branco para dividir igual.
                  </p>
                  {rateio.map((r, idx) => (
                    <div key={r.socio} className="flex items-center gap-3">
                      <span className="text-xs text-white flex-1 min-w-0 truncate">{r.socio}</span>
                      <input id={`ci-parte-${idx}`} type="number" min="0" step="0.01"
                        aria-label={`Valor de ${r.socio}`}
                        placeholder={(r.cent / 100).toFixed(2)}
                        value={form.partes[r.socio] ?? ""}
                        onChange={ev => setForm(f => ({ ...f, partes: { ...f.partes, [r.socio]: ev.target.value } }))}
                        className="w-32 rounded-xl px-3 py-1.5 text-sm text-white border focus:outline-none text-right" style={inputStyle} />
                    </div>
                  ))}
                  {!rateioOk && totalCent > 0 && (
                    <p className="text-[11px]" style={{ color: "#f87171" }}>
                      A soma das partes ({brl(rateio.reduce((a, r) => a + r.cent, 0) / 100)}) precisa ser igual ao valor total ({brl(totalCent / 100)}), e cada parte maior que zero.
                    </p>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="ci-desc" className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Descrição *</label>
                <input id="ci-desc" type="text" value={form.descricao} onChange={ev => setForm(f => ({ ...f, descricao: ev.target.value }))}
                  placeholder={form.origem === "venda_loja" ? "Ex: Loja — pagamento da fatura do cartão de novembro" : "Ex: Aporte para fatura do cartão de agosto"}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="ci-obs" className="block text-[10px] font-semibold mb-1" style={{ color: "#6b7280" }}>Observação</label>
                <input id="ci-obs" type="text" value={form.observacao} onChange={ev => setForm(f => ({ ...f, observacao: ev.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none" style={inputStyle} />
              </div>
              <ResponsavelPicker label={editing ? "Editado por" : "Lançado por"} value={form.responsavel}
                onChange={v => setForm(f => ({ ...f, responsavel: v }))} />
              {erro && <p className="text-xs" style={{ color: "#f87171" }}>{erro}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={save} disabled={saving || !podeSalvar}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#10b981" }}>
                {saving ? "Salvando…" : editing ? "✓ Salvar alterações" : "✓ Lançar entrada"}
              </button>
              <button onClick={() => setShowModal(false)} className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: "#1f2937", color: "#9ca3af" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
