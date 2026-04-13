/**
 * POST /api/webhook/ultramsg
 * Recebe mensagens do UltraMsg e cria/atualiza leads no CRM.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type UltraMsgWebhook = {
  event_type?: string;
  instanceId?:  string;
  data?: {
    id?:       string;
    from?:     string;
    to?:       string;
    body?:     string;
    type?:     string;
    fromMe?:   boolean;
    pushname?: string;
    timestamp?: number;
  };
};

export async function POST(req: NextRequest) {
  let body: UltraMsgWebhook;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const { event_type, data, instanceId } = body;

  // só processa mensagens recebidas (não enviadas)
  if (event_type !== "message_received" && event_type !== "message") {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (!data || data.fromMe) return NextResponse.json({ ok: true, skipped: true });

  const phone = (data.from ?? "").replace(/[^0-9]/g, "");
  if (!phone) return NextResponse.json({ ok: true, skipped: true });

  const name    = data.pushname ?? null;
  const message = data.body ?? "";

  // Descobre a qual loja pertence essa instância UltraMsg
  let storeId: string | null = null;
  if (instanceId) {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("ultramsg_instance", instanceId)
      .maybeSingle();
    storeId = user?.id ?? null;
  }

  // Verifica se lead já existe
  const query = supabaseAdmin
    .from("leads")
    .select("id, stage, name")
    .eq("phone", phone);

  if (storeId) query.eq("store_id", storeId);

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Atualiza nome se estiver em branco
    if (!existing.name && name) {
      await supabaseAdmin.from("leads").update({ name, updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
    // Registra a mensagem nos logs (se tabela existir)
    await supabaseAdmin.from("messages").insert({
      lead_id:    existing.id,
      direction:  "in",
      content:    message,
      source:     "ultramsg",
      created_at: new Date().toISOString(),
    }).then(() => {});
  } else {
    // Cria novo lead
    const leadData: Record<string, unknown> = {
      phone,
      name:       name ?? null,
      source:     "whatsapp",
      stage:      "Novo Lead",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (storeId) leadData.store_id = storeId;

    const { data: newLead } = await supabaseAdmin
      .from("leads")
      .insert(leadData)
      .select("id")
      .single();

    if (newLead?.id) {
      await supabaseAdmin.from("messages").insert({
        lead_id:    newLead.id,
        direction:  "in",
        content:    message,
        source:     "ultramsg",
        created_at: new Date().toISOString(),
      }).then(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
