/**
 * POST /api/webhook/olx?token=STORE_TOKEN
 *
 * Recebe leads da OLX Pro (plataforma parceira).
 * A URL configurada no painel OLX deve ser:
 *   https://SEU_DOMINIO/api/webhook/olx?token=TOKEN_DA_LOJA
 *
 * Payload esperado da OLX:
 * {
 *   "lead_id": "...",
 *   "name": "João Silva",
 *   "phone": "11999998888",
 *   "email": "joao@email.com",
 *   "message": "Tenho interesse no veículo",
 *   "ad_id": "...",
 *   "ad_title": "Fiat Uno 2020",
 *   "created_at": "2024-01-01T12:00:00Z"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type OlxPayload = {
  lead_id?:   string;
  name?:      string;
  phone?:     string;
  email?:     string;
  message?:   string;
  ad_id?:     string;
  ad_title?:  string;
  created_at?: string;
  // Variações de campo que a OLX pode enviar
  nome?:      string;
  telefone?:  string;
  mensagem?:  string;
  anuncio?:   string;
};

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token obrigatório" }, { status: 401 });
  }

  // Identifica a loja pelo token
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, olx_active")
    .eq("olx_webhook_token", token)
    .eq("olx_active", true)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "Token inválido ou integração desativada" }, { status: 401 });
  }

  let payload: OlxPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Normaliza campos (OLX pode enviar em PT ou EN)
  const name  = payload.name  || payload.nome  || "Lead OLX";
  const phone = payload.phone || payload.telefone || "";
  const msg   = payload.message || payload.mensagem || "";
  const ad    = payload.ad_title || payload.anuncio  || "";

  if (!phone) {
    return NextResponse.json({ error: "Telefone obrigatório no payload" }, { status: 400 });
  }

  // Formata telefone (remove não-dígitos)
  const cleanPhone = phone.replace(/\D/g, "");

  // Monta observação com dados do anúncio
  const notes = [
    ad    ? `Veículo de interesse: ${ad}` : null,
    msg   ? `Mensagem: ${msg}` : null,
    payload.email ? `E-mail: ${payload.email}` : null,
  ].filter(Boolean).join(" | ");

  // Cria o lead
  const { error } = await supabaseAdmin.from("leads").insert({
    phone:   cleanPhone,
    name:    name,
    source:  "olx",
    stage:   "Novo Lead",
    budget:  notes || null,
    user_id: user.id,
  });

  if (error) {
    console.error("[OLX Webhook] Erro ao criar lead:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[OLX Webhook] Lead criado — loja ${user.id} | ${name} | ${cleanPhone}`);
  return NextResponse.json({ ok: true, source: "olx" });
}
