/**
 * GET /api/cron/followup
 * Cron job de follow-up automático — Paulo reengaja leads parados.
 *
 * Protegido por CRON_SECRET no header Authorization.
 * Configure no Railway Cron: GET /api/cron/followup a cada hora.
 *
 * Lógica:
 *  - Busca leads ativos (não VENDIDO! nem Perdido) com ai_enabled=true
 *  - Última mensagem há mais de 24h (ou nunca respondido)
 *  - Sem follow-up nas últimas 48h
 *  - Envia mensagem de reengajamento via Z-API por estágio
 *  - Registra last_followup_at + incrementa followup_count
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const STAGE_MESSAGES: Record<string, (name: string, vehicle?: string) => string> = {
  "Novo Lead": (name) =>
    `Oi ${name}! 😊 Vi que você se interessou em um veículo aqui na PH Autoscar. Ainda posso te ajudar a encontrar o carro ideal?`,
  "Contato Inicial": (name) =>
    `Oi ${name}! 👋 Passei pra ver se você ainda tem interesse. Temos novidades no estoque essa semana!`,
  "Interesse": (name, vehicle) =>
    vehicle
      ? `Oi ${name}! 🚗 Ainda tem interesse no ${vehicle}? Posso verificar condições especiais pra você hoje!`
      : `Oi ${name}! Ainda pensando em qual veículo escolher? Me conta — posso te ajudar a decidir 😊`,
  "Proposta": (name) =>
    `Oi ${name}! Ainda pensando na proposta? Posso ajustar as condições pra ficar mais fácil pra você 😊`,
  "Negociação": (name) =>
    `Oi ${name}! 🤝 Alguma dúvida sobre a negociação? Estou aqui pra resolver o que precisar!`,
};

async function sendZAPIText(
  instance: string,
  token: string,
  clientToken: string,
  phone: string,
  message: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": clientToken },
        body: JSON.stringify({ phone, message }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Auth
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Busca loja(s) ativas com credenciais Z-API
  const { data: stores } = await supabaseAdmin
    .from("users")
    .select("id, zapi_instance, zapi_token, zapi_client_token")
    .not("zapi_instance", "is", null)
    .not("zapi_token", "is", null);

  if (!stores?.length) return NextResponse.json({ ok: true, sent: 0, msg: "sem lojas" });

  let totalSent = 0;

  for (const store of stores) {
    // Leads ativos, com IA habilitada, sem follow-up recente
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, phone, name, stage, vehicle_name, ai_enabled, last_followup_at, followup_count")
      .eq("store_id", store.id)
      .not("stage", "in", '("VENDIDO!","Perdido")')
      .or(`last_followup_at.is.null,last_followup_at.lt.${now48h}`)
      .neq("ai_enabled", false)
      .limit(20);  // processa 20 por ciclo para não sobrecarregar

    if (!leads?.length) continue;

    // Para cada lead, verifica última mensagem
    for (const lead of leads) {
      try {
        const { data: lastMsg } = await supabaseAdmin
          .from("messages")
          .select("created_at")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Pula se houve mensagem nas últimas 24h
        if (lastMsg && new Date(lastMsg.created_at) > new Date(now24h)) continue;

        // Monta mensagem por estágio
        const stage   = lead.stage ?? "Novo Lead";
        const getName = (lead.name ?? "").split(" ")[0] || "tudo bem";
        const msgFn   = STAGE_MESSAGES[stage] ?? STAGE_MESSAGES["Novo Lead"];
        const text    = msgFn(getName, lead.vehicle_name ?? undefined);

        const ok = await sendZAPIText(
          store.zapi_instance!,
          store.zapi_token!,
          store.zapi_client_token!,
          lead.phone,
          text,
        );

        if (ok) {
          // Registra follow-up
          await supabaseAdmin.from("leads").update({
            last_followup_at: new Date().toISOString(),
            followup_count: (lead.followup_count ?? 0) + 1,
          }).eq("id", lead.id);

          // Salva mensagem no histórico
          await supabaseAdmin.from("messages").insert({
            lead_id:  lead.id,
            text,
            from_me:  true,
            created_at: new Date().toISOString(),
          });

          totalSent++;
          console.log(`[FOLLOWUP] ✅ ${lead.phone} [${stage}]`);
        }
      } catch (e) {
        console.error(`[FOLLOWUP] ❌ lead:${lead.id}`, e);
      }
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent });
}
