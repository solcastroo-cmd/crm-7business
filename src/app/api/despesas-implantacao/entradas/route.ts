import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Caixa da implantação: entradas (aporte de sócio, venda da loja) que pagam
// as despesas de implantação (cartão e pix). Não entra no fluxo de caixa.

const ORIGENS = ["aporte_socio", "venda_loja", "outro"];

export async function GET(req: NextRequest) {
  const lojaId = req.nextUrl.searchParams.get("loja_id");
  let query = supabaseAdmin
    .from("implantacao_entradas")
    .select("*")
    .order("data", { ascending: true });
  if (lojaId) query = query.eq("loja_id", lojaId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { loja_id, data, origem, socio, descricao, valor, observacao, lancado_por } = body;
  if (!loja_id || !descricao || !valor) {
    return NextResponse.json({ error: "loja_id, descricao e valor são obrigatórios" }, { status: 400 });
  }
  const { data: row, error } = await supabaseAdmin
    .from("implantacao_entradas")
    .insert({
      loja_id,
      data: data || new Date().toISOString().split("T")[0],
      origem: ORIGENS.includes(origem) ? origem : "aporte_socio",
      socio: socio || null,
      descricao,
      valor: Number(valor),
      observacao: observacao || null,
      lancado_por: lancado_por || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["data", "origem", "socio", "descricao", "valor", "observacao", "editado_por"];
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (fields[k] !== undefined) payload[k] = fields[k];
  }
  if (payload.origem !== undefined && !ORIGENS.includes(String(payload.origem))) {
    return NextResponse.json({ error: "origem inválida" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("implantacao_entradas")
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
  const { error } = await supabaseAdmin.from("implantacao_entradas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
