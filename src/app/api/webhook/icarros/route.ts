/**
 * POST /api/webhook/icarros?token=STORE_TOKEN
 *
 * Recebe leads do iCarros (plataforma parceira).
 * A URL configurada no painel iCarros deve ser:
 *   https://SEU_DOMINIO/api/webhook/icarros?token=TOKEN_DA_LOJA
 *
 * Payload esperado do iCarros:
 * {
 *   "id": "lead_id",
 *   "nome": "Carlos Oliveira",
 *   "telefone": "11977776666",
 *   "email": "carlos@email.com",
 *   "mensagem": "Gostaria de mais informações",
 *   "veiculo": "Toyota Corolla 2021",
 *   "ano": "2021",
 *   "km": "30000",
 *   "preco": "120000",
 *   "anuncio_id": "98765"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ICarrosPayload = {
  id?:         string;
  nome?:       string;
  name?:       string;
  telefone?:   string;
  phone?:      string;
  email?:      string;
  mensagem?:   string;
  message?:    string;
  veiculo?:    string;
  ad_title?:   string;
  ano?:        string;
  km?:         string;
  preco?:      string;
  price?:      string;
  anuncio_id?: string;
};

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token obrigatório" }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, icarros_active")
    .eq("icarros_webhook_token", token)
    .eq("icarros_active", true)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "Token inválido ou integração desativada" }, { status: 401 });
  }

  let payload: ICarrosPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const name    = payload.nome     || payload.name    || "Lead iCarros";
  const phone   = payload.telefone || payload.phone   || "";
  const msg     = payload.mensagem || payload.message || "";
  const veiculo = payload.veiculo  || payload.ad_title || "";
  const preco   = payload.preco    || payload.price    || "";
  const ano     = payload.ano || "";
  const km      = payload.km  || "";

  if (!phone) {
    return NextResponse.json({ error: "Telefone obrigatório no payload" }, { status: 400 });
  }

  const cleanPhone = phone.replace(/\D/g, "");

  const notes = [
    veiculo ? `Veículo: ${veiculo}${ano ? ` ${ano}` : ""}${km ? ` | ${km} km` : ""}` : null,
    preco   ? `Preço: R$ ${preco}` : null,
    msg     ? `Mensagem: ${msg}`   : null,
    payload.email ? `E-mail: ${payload.email}` : null,
  ].filter(Boolean).join(" | ");

  const { error } = await supabaseAdmin.from("leads").insert({
    phone:   cleanPhone,
    name:    name,
    source:  "icarros",
    stage:   "Novo Lead",
    budget:  notes || null,
    user_id: user.id,
  });

  if (error) {
    console.error("[iCarros Webhook] Erro ao criar lead:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[iCarros Webhook] Lead criado — loja ${user.id} | ${name} | ${cleanPhone}`);
  return NextResponse.json({ ok: true, source: "icarros" });
}
