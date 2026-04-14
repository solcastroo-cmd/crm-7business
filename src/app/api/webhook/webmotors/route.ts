/**
 * POST /api/webhook/webmotors?token=STORE_TOKEN
 *
 * Recebe leads do Webmotors (plataforma parceira).
 * A URL configurada no painel Webmotors deve ser:
 *   https://SEU_DOMINIO/api/webhook/webmotors?token=TOKEN_DA_LOJA
 *
 * Payload esperado do Webmotors:
 * {
 *   "id": "lead_id",
 *   "nome": "Maria Santos",
 *   "telefone": "11988887777",
 *   "email": "maria@email.com",
 *   "mensagem": "Interesse no veículo",
 *   "veiculo": "Honda Civic 2022",
 *   "anuncio_id": "12345",
 *   "preco": "85000",
 *   "data": "2024-01-01T12:00:00Z"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type WebmotorsPayload = {
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
  anuncio_id?: string;
  preco?:      string;
  price?:      string;
  data?:       string;
};

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token obrigatório" }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, webmotors_active")
    .eq("webmotors_webhook_token", token)
    .eq("webmotors_active", true)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "Token inválido ou integração desativada" }, { status: 401 });
  }

  let payload: WebmotorsPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const name  = payload.nome   || payload.name  || "Lead Webmotors";
  const phone = payload.telefone || payload.phone || "";
  const msg   = payload.mensagem || payload.message || "";
  const veiculo = payload.veiculo || payload.ad_title || "";
  const preco   = payload.preco   || payload.price    || "";

  if (!phone) {
    return NextResponse.json({ error: "Telefone obrigatório no payload" }, { status: 400 });
  }

  const cleanPhone = phone.replace(/\D/g, "");

  const notes = [
    veiculo ? `Veículo: ${veiculo}` : null,
    preco   ? `Preço: R$ ${preco}`  : null,
    msg     ? `Mensagem: ${msg}`    : null,
    payload.email ? `E-mail: ${payload.email}` : null,
  ].filter(Boolean).join(" | ");

  const { error } = await supabaseAdmin.from("leads").insert({
    phone:   cleanPhone,
    name:    name,
    source:  "webmotors",
    stage:   "Novo Lead",
    budget:  notes || null,
    user_id: user.id,
  });

  if (error) {
    console.error("[Webmotors Webhook] Erro ao criar lead:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[Webmotors Webhook] Lead criado — loja ${user.id} | ${name} | ${cleanPhone}`);
  return NextResponse.json({ ok: true, source: "webmotors" });
}
