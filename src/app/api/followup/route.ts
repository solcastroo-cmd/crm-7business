/**
 * 🔁 /api/followup — Follow-up automático PAULO (Agente Vendedor PH Autoscar)
 *
 * Sequência baseada no documento de skills do agente Paulo:
 *  - 30min  → lembrete leve
 *  - 3h     → reforço com valor
 *  - 24h    → gatilho de oportunidade
 *  - 48h    → gatilho de escassez
 *  - 72h    → mensagem de saída elegante
 *
 * POST → verifica leads inativos e envia a mensagem correta conforme tempo decorrido
 * Stages excluídos: VENDIDO! e Perdido
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const MAX_FOLLOWUPS      = 50;
const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL  ?? "";
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "PH_AUTOSCAR";

/** Escolhe a mensagem correta com base nas horas de inatividade do lead */
function getFollowupMessage(name: string, hoursInactive: number): string | null {
  const n = name || "cliente";

  // 72h+ → mensagem de saída elegante (última tentativa)
  if (hoursInactive >= 72) {
    return `Prometo não te incomodar mais 😊 Se ainda quiser o carro ou a simulação, me chama aqui que continuo de onde paramos.`;
  }
  // 48h → gatilho de escassez
  if (hoursInactive >= 48) {
    return `Atualizando você 🙏 Esse veículo teve bastante procura hoje. Quer que eu veja outras opções parecidas?`;
  }
  // 24h → gatilho de oportunidade
  if (hoursInactive >= 24) {
    return `Passando rápido porque esse modelo costuma sair rápido aqui 😅 ${n}, ainda tem interesse ou já conseguiu seu carro?`;
  }
  // 3h → reforço com valor
  if (hoursInactive >= 3) {
    return `Consegui condições melhores com o banco agora pouco 👀 ${n}, quer que eu te envie a simulação?`;
  }
  // 0.5h (30min) → lembrete leve
  if (hoursInactive >= 0.5) {
    return `Oi 😊 consegui separar mais detalhes do carro pra você. Ainda está procurando veículo?`;
  }

  return null; // Menos de 30min → não enviar
}

/** Mensagens de reativação para leads antigos (3, 7, 15, 30, 60 dias) */
function getReactivationMessage(name: string, daysInactive: number): string | null {
  const n = name || "cliente";
  if (daysInactive >= 60) return `${n}, ainda posso te ajudar a encontrar seu carro ideal 😊`;
  if (daysInactive >= 30) return `${n}, apareceram oportunidades abaixo da tabela essa semana 👀`;
  if (daysInactive >= 15) return `${n}, condições melhores de financiamento essa semana. Quer ver?`;
  if (daysInactive >= 7)  return `${n}, chegaram carros novos 🚗 quer ver?`;
  if (daysInactive >= 3)  return `${n}, apareceu uma condição nova e lembrei de você 😊`;
  return null;
}

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
  const secret    = req.headers.get("x-followup-secret");
  const envSecret = process.env.FOLLOWUP_SECRET;
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Busca leads com pelo menos 30min de inatividade, fora de VENDIDO!/Perdido
  const cutoff30min = new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString();
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone, stage, updated_at")
    .lt("updated_at", cutoff30min)
    .not("stage", "in", '("VENDIDO!","Perdido")')
    .order("updated_at", { ascending: true })
    .limit(MAX_FOLLOWUPS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ sent: 0, message: "Nenhum lead inativo encontrado." });
  }

  let sent = 0;
  const results: { phone: string; message: string; ok: boolean }[] = [];

  for (const lead of leads) {
    const phoneNum = (lead.phone ?? "").replace(/\D/g, "").replace(/^wa:?/, "");
    if (!phoneNum) continue;

    const now           = Date.now();
    const updatedAt     = new Date(lead.updated_at).getTime();
    const hoursInactive = (now - updatedAt) / (1000 * 60 * 60);
    const daysInactive  = hoursInactive / 24;

    // Leads com mais de 3 dias → usa sequência de reativação
    let message: string | null = null;
    if (daysInactive >= 3) {
      message = getReactivationMessage(lead.name ?? "", daysInactive);
    } else {
      message = getFollowupMessage(lead.name ?? "", hoursInactive);
    }

    if (!message) continue;

    const ok = await sendWhatsApp(phoneNum, message);
    results.push({ phone: phoneNum, message, ok });

    if (ok) {
      await supabaseAdmin
        .from("messages")
        .insert({ lead_id: lead.id, text: message, from_me: true });
      sent++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[Paulo Follow-up] ${sent}/${leads.length} mensagens enviadas`);
  return NextResponse.json({ sent, total: leads.length, results });
}

// GET → status (útil para verificar se o endpoint está ativo)
export async function GET() {
  return NextResponse.json({
    status: "ok",
    agent: "Paulo — Vendedor PH Autoscar",
    followup_sequence: ["30min", "3h", "24h", "48h", "72h"],
    reactivation_sequence: ["3d", "7d", "15d", "30d", "60d"],
    evolution_configured: !!EVOLUTION_API_URL,
  });
}
