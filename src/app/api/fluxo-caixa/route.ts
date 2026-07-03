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
  source: "venda" | "recebimento" | "despesa_loja" | "despesa_veiculo";
  status: "pago" | "pendente";
};

/* ── GET — ledger unificado (entradas + saídas) com saldo corrido ── */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const dateFrom = url.searchParams.get("dateFrom") ?? "";
  const dateTo   = url.searchParams.get("dateTo") ?? "";

  const [incomeRes, salesRes, storeExpRes, vehicleExpRes, bankRes, vehiclesRes] = await Promise.all([
    supabaseAdmin.from("store_income").select("*").order("date", { ascending: true }),
    supabaseAdmin.from("sales").select("id,vehicle_id,total_value,closing_date,status,buyer_name").order("closing_date", { ascending: true }),
    supabaseAdmin.from("store_expenses").select("*").order("date", { ascending: true }),
    supabaseAdmin.from("vehicle_expenses").select("id,vehicle_id,date,category,description,amount").order("date", { ascending: true }),
    supabaseAdmin.from("bank_accounts").select("id,name,balance,reference_date").order("created_at", { ascending: true }),
    supabaseAdmin.from("vehicles").select("id,brand,model,purchase_price"),
  ]);

  for (const [label, res] of Object.entries({ income: incomeRes, sales: salesRes, storeExp: storeExpRes, vehicleExp: vehicleExpRes, bank: bankRes, vehicles: vehiclesRes })) {
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
