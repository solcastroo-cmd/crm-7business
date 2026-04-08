/**
 * 🔁 /api/followup — Follow-up automático de leads inativos
 *
 * POST → verifica leads sem atualização há mais de HOURS_THRESHOLD horas
 *        envia mensagem de reativação via Evolution API
 *
 * Uso:
 *  - Chamada manual: POST /api/followup
 *  - Cron (Railway): configurar como job diário
 *
 * Stages excluídos: VENDIDO! e Perdido (leads finalizados)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const HOURS_THRESHOLD    = 24;       // horas sem resposta para disparar follow-up
const MAX_FOLLOWUPS      = 50;       // limite por execução
const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL  ?? "";
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR";

const MESSAGES = [
  "Olá, {nome}! 👋 Ainda está interessado em um veículo? Temos novidades no estoque que podem te interessar.",
  "Oi, {nome}! Aqui é o PAULO da 7Business. Que tal agendar uma visita para ver os veículos disponíveis? 🚗",
  "Boa tarde, {nome}! Ainda posso te ajudar a encontrar o veículo ideal. Me fala: o que você está buscando? 😊",
];

async function sendWhatsApp(number: string, text: string): Promise<boolean> {
  if (!EVOLUTION_API_URL || !number) return false;
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Autenticação simples via header secreto
  const secret = req.headers.get("x-followup-secret");
  const envSecret = process.env.FOLLOWUP_SECRET;
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - HOURS_THRESHOLD * 60 * 60 * 1000).toISOString();

  // Busca leads inativos (sem atualização no período, fora de VENDIDO! e Perdido)
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone, stage, updated_at")
    .lt("updated_at", cutoff)
    .not("stage", "in", '("VENDIDO!","Perdido")')
    .order("updated_at", { ascending: true })
    .limit(MAX_FOLLOWUPS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ sent: 0, message: "Nenhum lead inativo encontrado." });
  }

  let sent = 0;
  const results: { phone: string; ok: boolean }[] = [];

  for (const lead of leads) {
    const phoneNum = lead.phone.replace(/\D/g, "").replace(/^wa:?/, "");
    if (!phoneNum) continue;

    const name    = lead.name ?? "cliente";
    const msgTpl  = MESSAGES[sent % MESSAGES.length];
    const message = msgTpl.replace("{nome}", name);

    const ok = await sendWhatsApp(phoneNum, message);
    results.push({ phone: phoneNum, ok });

    if (ok) {
      // Registra no banco para evitar follow-up duplicado (atualiza updated_at)
      await supabaseAdmin
        .from("messages")
        .insert({ lead_id: lead.id, text: message, from_me: true });
      sent++;
    }

    // Pausa 300ms entre envios para evitar rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[Followup] ${sent}/${leads.length} mensagens enviadas`);
  return NextResponse.json({ sent, total: leads.length, results });
}

// GET → status (útil para verificar se o endpoint está ativo)
export async function GET() {
  return NextResponse.json({
    status: "ok",
    threshold_hours: HOURS_THRESHOLD,
    evolution_configured: !!EVOLUTION_API_URL,
  });
}
