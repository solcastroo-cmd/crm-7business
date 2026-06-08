/**
 * POST /api/capi/recalc?storeId=xxx
 * Recalcula score de TODOS os leads sem score (score=0 ou null)
 * usando o histórico completo de mensagens do cliente.
 * Retorna { total, updated, skipped, errors }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calcLeadScore } from "@/lib/capi";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    // Busca leads sem score
    let query = supabaseAdmin
      .from("leads")
      .select("id, phone, name")
      .or("score.is.null,score.eq.0");

    if (storeId) query = query.eq("store_id", storeId);

    const { data: leads, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) return NextResponse.json({ total: 0, updated: 0, skipped: 0 });

    let updated = 0;
    let skipped = 0;
    let errors  = 0;

    for (const lead of leads) {
      try {
        // Carrega mensagens do cliente
        const { data: msgs } = await supabaseAdmin
          .from("messages")
          .select("text")
          .eq("lead_id", lead.id)
          .eq("from_me", false)
          .order("created_at", { ascending: true })
          .limit(100);

        if (!msgs || msgs.length === 0) { skipped++; continue; }

        const score = calcLeadScore(msgs.map(m => m.text ?? ""));

        if (score > 0) {
          await supabaseAdmin.from("leads").update({ score }).eq("id", lead.id);
          updated++;
        } else {
          skipped++;
        }
      } catch {
        errors++;
      }
    }

    console.log(`[RECALC] total:${leads.length} updated:${updated} skipped:${skipped} errors:${errors}`);
    return NextResponse.json({ total: leads.length, updated, skipped, errors });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
