import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lojaId = req.nextUrl.searchParams.get("loja_id");

  let query = supabaseAdmin
    .from("despesas_implantacao")
    .select("*")
    .order("data_despesa", { ascending: false });

  if (lojaId) query = query.eq("loja_id", lojaId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { loja_id, descricao, categoria, valor, data_despesa, observacao, forma_pagamento, parcelas, valor_parcela, data_vencimento } = body;

  if (!loja_id || !descricao || !categoria || !valor) {
    return NextResponse.json(
      { error: "loja_id, descricao, categoria e valor são obrigatórios" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("despesas_implantacao")
    .insert({
      loja_id,
      descricao,
      categoria,
      valor: Number(valor),
      data_despesa: data_despesa || new Date().toISOString().split("T")[0],
      observacao: observacao ?? null,
      forma_pagamento: forma_pagamento ?? "avista",
      parcelas: parcelas ?? 1,
      valor_parcela: valor_parcela ?? null,
      data_vencimento: data_vencimento ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["descricao", "categoria", "valor", "data_despesa", "observacao", "forma_pagamento", "parcelas", "valor_parcela", "data_vencimento", "parcelas_pagas"];
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }

  const { data, error } = await supabaseAdmin
    .from("despesas_implantacao")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("despesas_implantacao")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
