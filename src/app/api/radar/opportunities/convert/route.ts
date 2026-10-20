import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId } from "@/lib/radar/ig";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { data: o } = await supabaseAdmin.from("radar_opportunities").select("*").eq("id", id).eq("store_id", storeId).maybeSingle();
  if (!o) return NextResponse.json({ error: "Oportunidade não encontrada" }, { status: 404 });
  if (o.lead_id) return NextResponse.json({ ok: true, leadId: o.lead_id });

  // Lead de Instagram: sem telefone. ai_enabled=false evita follow-up automático por WhatsApp.
  const { data: lead, error } = await supabaseAdmin.from("leads").insert({
    store_id: storeId,
    phone: `ig:${o.username}`,
    name: `@${o.username}`,
    stage: "Novo Lead",
    source: "instagram",
    meta_lead_id: `ig:${o.ig_comment_id}`,
    vehicle_name: o.vehicle_hint,
    notes: [`Instagram (${o.source}): "${o.text}"`, o.summary, o.media_permalink].filter(Boolean).join("\n"),
    qualification: o.temperature ?? "frio",
    score: o.score ?? 0,
    ai_enabled: false,
    ai_intent: o.intent,
    ai_score: o.score,
    ai_summary: o.summary,
    ai_temperature: o.temperature,
    ai_analyzed_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !lead) return NextResponse.json({ error: error?.message ?? "Falha ao criar lead" }, { status: 500 });

  await supabaseAdmin.from("radar_opportunities").update({ status: "convertido", lead_id: lead.id }).eq("id", id);
  return NextResponse.json({ ok: true, leadId: lead.id });
}
