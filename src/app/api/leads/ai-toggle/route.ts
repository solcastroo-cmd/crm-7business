/**
 * PATCH /api/leads/ai-toggle?leadId=xxx
 * Liga/desliga o Paulo (IA) para um lead específico.
 *
 * Body: { ai_enabled: boolean }
 *
 * Handoff:
 *   ai_enabled = true  → Paulo responde automaticamente
 *   ai_enabled = false → Vendedor humano assumiu, Paulo fica mudo
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");

  if (!leadId || !UUID_REGEX.test(leadId)) {
    return NextResponse.json({ error: "leadId inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.ai_enabled !== "boolean") {
    return NextResponse.json({ error: "ai_enabled (boolean) é obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({ ai_enabled: body.ai_enabled })
    .eq("id", leadId)
    .select("id, ai_enabled")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[AI Toggle] Lead ${leadId} → ai_enabled=${body.ai_enabled}`);
  return NextResponse.json(data);
}
