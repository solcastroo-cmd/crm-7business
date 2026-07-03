import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Entry = {
  id: string;
  date: string;
  type: "entrada" | "saida";
  description: string;
  category: string;
  amount: number;
  source: "venda" | "recebimento" | "despesa_loja" | "despesa_veiculo" | "despesa_implantacao";
  status: "pago" | "pendente";
};

const IMPLANTACAO_CAT_LABEL: Record<string, string> = {
  ativo_imobilizado: "Ativo Imobilizado",
  uso_e_consumo: "Uso e Consumo",
  outros: "Outros",
};

function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

type DespesaImplantacao = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
  forma_pagamento?: string;
  parcelas?: number;
  valor_parcela?: number;
  data_vencimento?: string;
  parcelas_pagas?: number[];
};

function expandParcelasImplantacao(d: DespesaImplantacao) {
  const parcelas = d.parcelas ?? 1;
  const pagas = d.parcelas_pagas ?? [];
  if (d.forma_pagamento === "cartao_credito" && d.data_vencimento && parcelas > 1) {
    const valorParcela = d.valor_parcela ?? Number(d.valor) / parcelas;
    return Array.from({ length: parcelas }, (_, i) => ({
      date: addMonths(d.data_vencimento!, i),
      valor: Number(valorParcela),
      label: `${d.descricao} (parcela ${i + 1}/${parcelas})`,
      parcela: i + 1,
      paga: pagas.includes(i + 1),
    }));
  }
  const dataBase = d.forma_pagamento === "cartao_credito" && d.data_vencimento ? d.data_vencimento : d.data_despesa;
  return [{ date: dataBase, valor: Number(d.valor), label: d.descricao, parcela: 1, paga: pagas.includes(1) }];
}

/* ── GET — ledger unificado (entradas + saídas) com saldo corrido ── */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const dateFrom = url.searchParams.get("dateFrom") ?? "";
  const dateTo   = url.searchParams.get("dateTo") ?? "";

  const [incomeRes, salesRes, storeExpRes, vehicleExpRes, bankRes, vehiclesRes, implantacaoRes] = await Promise.all([
    supabaseAdmin.from("store_income").select("*").order("date", { ascending: true }),
    supabaseAdmin.from("sales").select("id,vehicle_id,total_value,closing_date,status,buyer_name").order("closing_date", { ascending: true }),
    supabaseAdmin.from("store_expenses").select("*").order("date", { ascending: true }),
    supabaseAdmin.from("vehicle_expenses").select("id,vehicle_id,date,category,description,amount").order("date", { ascending: true }),
    supabaseAdmin.from("bank_accounts").select("id,name,balance,reference_date").order("created_at", { ascending: true }),
    supabaseAdmin.from("vehicles").select("id,brand,model,purchase_price"),
    supabaseAdmin.from("despesas_implantacao").select("id,descricao,categoria,valor,data_despesa,forma_pagamento,parcelas,valor_parcela,data_vencimento,parcelas_pagas"),
  ]);

  for (const [label, res] of Object.entries({ income: incomeRes, sales: salesRes, storeExp: storeExpRes, vehicleExp: vehicleExpRes, bank: bankRes, vehicles: vehiclesRes, implantacao: implantacaoRes })) {
    if (res.error) console.error(`[fluxo-caixa] ${label} query error:`, res.error.message);
  }

  const entries: Entry[] = [];

  for (const i of incomeRes.data ?? []) {
    if (i.status !== "recebido") continue;
    entries.push({
      id: i.id, date: i.date, type: "entrada",
      description: i.description, category: i.category,
      amount: Number(i.amount), source: "recebimento", status: "pago",
    });
  }

  const vehicleMap: Record<string, { brand: string; model: string; purchase_price: number }> = {};
  for (const v of vehiclesRes.data ?? []) {
    vehicleMap[v.id] = { brand: v.brand, model: v.model, purchase_price: Number(v.purchase_price ?? 0) };
  }

  const expensesByVehicle: Record<string, number> = {};
  for (const e of vehicleExpRes.data ?? []) {
    expensesByVehicle[e.vehicle_id] = (expensesByVehicle[e.vehicle_id] ?? 0) + Number(e.amount);
  }

  for (const s of salesRes.data ?? []) {
    if (s.status !== "pago" || !s.closing_date) continue;
    const veiculo = vehicleMap[s.vehicle_id];
    const investimento = (veiculo?.purchase_price ?? 0) + (expensesByVehicle[s.vehicle_id] ?? 0);
    const lucro = Number(s.total_value) - investimento;
    const nomeVeiculo = veiculo ? `${veiculo.brand} ${veiculo.model}` : "veículo";
    entries.push({
      id: s.id, date: s.closing_date, type: lucro >= 0 ? "entrada" : "saida",
      description: `Venda — ${s.buyer_name ?? "Cliente"} (${nomeVeiculo}) — ${lucro >= 0 ? "Lucro" : "Prejuízo"}`,
      category: "Venda de Veículo",
      amount: Math.abs(lucro), source: "venda", status: "pago",
    });
  }

  for (const e of storeExpRes.data ?? []) {
    if (e.status !== "pago") continue;
    entries.push({
      id: e.id, date: e.date, type: "saida",
      description: e.description, category: e.category,
      amount: Number(e.amount), source: "despesa_loja", status: "pago",
    });
  }

  // despesas de veículo (funilaria, pneus, etc.) não entram soltas no fluxo de caixa —
  // ficam só no módulo Financeiro e entram aqui embutidas no Lucro/Prejuízo, no fechamento da venda

  // despesas de implantação só entram no fluxo de caixa quando a parcela é dada baixa
  for (const d of (implantacaoRes.data ?? []) as DespesaImplantacao[]) {
    for (const item of expandParcelasImplantacao(d)) {
      if (!item.paga) continue;
      entries.push({
        id: `${d.id}-p${item.parcela}`, date: item.date, type: "saida",
        description: item.label, category: IMPLANTACAO_CAT_LABEL[d.categoria] ?? d.categoria,
        amount: item.valor, source: "despesa_implantacao", status: "pago",
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  const accounts = bankRes.data ?? [];

  // cada conta parte do saldo informado na sua data de referência; o que já
  // aconteceu antes dessa data está embutido no saldo e não deve ser somado de novo
  const netUnbounded = (refDate: string) =>
    entries
      .filter(e => e.date > refDate)
      .reduce((s, e) => s + (e.type === "entrada" ? e.amount : -e.amount), 0);

  const netBeforeDateFrom = (refDate: string) =>
    dateFrom
      ? entries
          .filter(e => e.date > refDate && e.date < dateFrom)
          .reduce((s, e) => s + (e.type === "entrada" ? e.amount : -e.amount), 0)
      : 0;

  // saldo das contas bancárias projetado até o início do período filtrado
  const saldoAnterior = accounts.reduce(
    (sum, acc) => sum + Number(acc.balance) + netBeforeDateFrom(acc.reference_date),
    0,
  );

  // saldo de cada conta projetado até hoje, para exibir o detalhamento por conta
  const contas = accounts.map(acc => ({
    id: acc.id,
    name: acc.name,
    balance: Number(acc.balance),
    referenceDate: acc.reference_date,
    saldoAtual: Number(acc.balance) + netUnbounded(acc.reference_date),
  }));

  const periodEntries = entries.filter(e => {
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    return true;
  });

  let running = saldoAnterior;
  const ledger = periodEntries.map(e => {
    running += e.type === "entrada" ? e.amount : -e.amount;
    return { ...e, saldo: running };
  });

  const entradas = periodEntries.filter(e => e.type === "entrada").reduce((s, e) => s + e.amount, 0);
  const saidas   = periodEntries.filter(e => e.type === "saida").reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    ledger,
    summary: {
      saldoAnterior,
      entradas,
      saidas,
      saldoPeriodo: entradas - saidas,
      saldoAcumulado: saldoAnterior + entradas - saidas,
      contas,
      saldoTotalContas: contas.reduce((s, c) => s + c.saldoAtual, 0),
    },
  });
}

/* ── POST — lançar recebimento avulso ── */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { store_id, date, description, category, amount, payment_method, status, notes } = body;

  if (!description || !amount) {
    return NextResponse.json({ error: "description e amount são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("store_income")
    .insert({
      store_id: store_id ?? null,
      date: date || new Date().toISOString().split("T")[0],
      description,
      category: category || "Outros",
      amount: Number(amount),
      payment_method: payment_method || "pix",
      status: status || "recebido",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/* ── PATCH — atualizar recebimento ── */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["date", "description", "category", "amount", "payment_method", "status", "notes"];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }

  const { data, error } = await supabaseAdmin
    .from("store_income")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/* ── DELETE — remover recebimento ── */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("store_income").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
