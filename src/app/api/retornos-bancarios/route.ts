import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CATEGORIA_RETORNO = "Receita de Retorno Bancário";

function buildIncomeDescription(r: {
  banco?: string | null; cliente?: string | null; veiculo?: string | null; proposta?: string | null;
}) {
  const parts = [r.banco, r.cliente, r.veiculo].filter(Boolean);
  const base = `Retorno Bancário${parts.length ? " — " + parts.join(" · ") : ""}`;
  return r.proposta ? `${base} (proposta ${r.proposta})` : base;
}

/* ── GET — lista todos os retornos ── */
export async function GET(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("bank_returns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/* ── POST — criação manual (ex.: vendas financiadas lançadas antes deste módulo existir) ── */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    store_id, sale_id, banco, proposta, cliente, veiculo,
    data_credito, valor_recebido, tipo, observacoes, vendedor, status,
  } = body;

  if (!store_id) return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("bank_returns")
    .insert({
      store_id, sale_id: sale_id ?? null,
      banco: banco ?? null, proposta: proposta ?? null,
      cliente: cliente ?? null, veiculo: veiculo ?? null,
      data_credito: data_credito ?? null,
      valor_recebido: valor_recebido != null ? Number(valor_recebido) : null,
      tipo: tipo ?? null, observacoes: observacoes ?? null, vendedor: vendedor ?? null,
      status: status ?? "aguardando_retorno",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/* ── PATCH — preencher/editar retorno; sincroniza com o Fluxo de Caixa ── */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: current, error: fetchError } = await supabaseAdmin
    .from("bank_returns")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !current) return NextResponse.json({ error: "Retorno não encontrado" }, { status: 404 });

  const allowed = [
    "banco", "proposta", "cliente", "veiculo", "data_credito",
    "valor_recebido", "tipo", "observacoes", "vendedor", "status",
  ];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }

  const merged = { ...current, ...payload };
  const goingToRecebido = merged.status === "recebido";

  if (goingToRecebido && (!merged.valor_recebido || !merged.data_credito)) {
    return NextResponse.json(
      { error: "Valor recebido e data do crédito são obrigatórios para marcar como Recebido" },
      { status: 400 },
    );
  }

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("bank_returns")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // sincroniza a entrada correspondente no Fluxo de Caixa (store_income)
  if (goingToRecebido) {
    const incomePayload = {
      store_id: data.store_id,
      date: data.data_credito,
      description: buildIncomeDescription(data),
      category: CATEGORIA_RETORNO,
      amount: Number(data.valor_recebido),
      payment_method: "transferencia",
      status: "recebido",
      notes: data.observacoes ?? null,
    };

    if (data.fluxo_caixa_entry_id) {
      await supabaseAdmin.from("store_income").update(incomePayload).eq("id", data.fluxo_caixa_entry_id);
    } else {
      const { data: income } = await supabaseAdmin.from("store_income").insert(incomePayload).select().single();
      if (income) {
        await supabaseAdmin.from("bank_returns").update({ fluxo_caixa_entry_id: income.id }).eq("id", id);
        data.fluxo_caixa_entry_id = income.id;
      }
    }
  } else if (current.fluxo_caixa_entry_id) {
    // saiu do status Recebido (ex.: correção, cancelamento) — remove a entrada do fluxo de caixa
    await supabaseAdmin.from("store_income").delete().eq("id", current.fluxo_caixa_entry_id);
    await supabaseAdmin.from("bank_returns").update({ fluxo_caixa_entry_id: null }).eq("id", id);
    data.fluxo_caixa_entry_id = null;
  }

  return NextResponse.json(data);
}

/* ── DELETE — remove o retorno e a entrada vinculada no fluxo de caixa, se houver ── */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: current } = await supabaseAdmin
    .from("bank_returns")
    .select("fluxo_caixa_entry_id")
    .eq("id", id)
    .single();

  if (current?.fluxo_caixa_entry_id) {
    await supabaseAdmin.from("store_income").delete().eq("id", current.fluxo_caixa_entry_id);
  }

  const { error } = await supabaseAdmin.from("bank_returns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
