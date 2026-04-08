/**
 * 💬 /api/messages — Histórico de mensagens de um lead
 *
 * GET  ?leadId=xxx  → últimas 30 mensagens (ordem cronológica)
 * POST              → adiciona mensagem manual (futuro: envio pelo CRM)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/messages?leadId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");

  if (!leadId || !UUID_REGEX.test(leadId)) {
    return NextResponse.json({ error: "leadId inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("id, text, from_me, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
