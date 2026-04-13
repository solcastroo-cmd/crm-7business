/**
 * 💬 /api/messages — Histórico e envio de mensagens de um lead
 *
 * GET  ?leadId=xxx  → últimas 50 mensagens (ordem cronológica)
 * POST              → vendedor envia mensagem manualmente pelo CRM
 *                     → salva no banco + envia via UltraMsg + desativa IA (handoff)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_ID   = process.env.STORE_ID ?? "";

// ── Carrega credenciais UltraMsg da loja ──────────────────────────────────────
type UltraCredentials = { instance: string; token: string } | null;

async function loadUltraCredentials(): Promise<UltraCredentials> {
  if (!STORE_ID) return null;
  const { data } = await supabaseAdmin
    .from("users")
    .select("ultramsg_instance, ultramsg_token")
    .eq("id", STORE_ID)
    .maybeSingle();
  if (!data?.ultramsg_instance || !data?.ultramsg_token) return null;
  return { instance: data.ultramsg_instance, token: data.ultramsg_token };
}

/** Envia mensagem via UltraMsg */
async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const creds = await loadUltraCredentials();
  if (!creds) {
    console.warn("[Messages] UltraMsg sem credenciais — mensagem não enviada");
    return false;
  }

  // Normaliza número: remove prefixo wa:, não-dígitos, adiciona DDI 55 se necessário
  const digits = phone.replace(/^wa:/, "").replace(/\D/g, "");
  if (!digits) return false;
  const number = digits.length <= 11 ? `55${digits}` : digits;

  try {
    const res = await fetch(`https://api.ultramsg.com/${creds.instance}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: creds.token, to: number, body: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[Messages] UltraMsg status:", res.status);
    return res.ok;
  } catch (e) {
    console.error("[Messages] Erro UltraMsg:", e);
    return false;
  }
}

// ── GET /api/messages?leadId=xxx ─────────────────────────────────────────────
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
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ── POST /api/messages — Vendedor envia mensagem manualmente ─────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { leadId, text } = body ?? {};

  if (!leadId || !UUID_REGEX.test(leadId)) {
    return NextResponse.json({ error: "leadId inválido" }, { status: 400 });
  }
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text é obrigatório" }, { status: 400 });
  }

  // 1. Busca telefone do lead
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, phone, ai_enabled")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  // 2. Salva mensagem no banco (from_me = true → enviada pela loja/vendedor)
  const { data: msg, error: msgErr } = await supabaseAdmin
    .from("messages")
    .insert({ lead_id: leadId, text: text.trim(), from_me: true })
    .select("id, text, from_me, created_at")
    .maybeSingle();

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // 3. Envia via WhatsApp
  const sent = await sendWhatsApp(lead.phone, text.trim());

  // 4. ⚡ HANDOFF — desativa Paulo automaticamente quando vendedor escreve
  //    (só atualiza se ainda estava ativo, para evitar writes desnecessários)
  if (lead.ai_enabled !== false) {
    await supabaseAdmin
      .from("leads")
      .update({ ai_enabled: false })
      .eq("id", leadId);

    console.log(`[Handoff] Lead ${leadId} → Paulo desativado (vendedor assumiu)`);
  }

  return NextResponse.json({ message: msg, whatsapp_sent: sent, ai_enabled: false });
}
