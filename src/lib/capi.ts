/**
 * 📡 capi.ts — Meta Conversions API (CAPI) v3
 *
 * Eventos suportados:
 *  • InitiateConversation → primeira mensagem do lead (novo contato)
 *  • Lead                 → lead quente por keyword
 *  • QualifiedLead        → score >= 70 (alta intenção de compra)
 *  • Purchase             → venda fechada no CRM
 *
 * Melhorias v3:
 *  - Deduplicação persistente via leads.capi_events (array no banco)
 *  - Event Match Quality elevado: fn, ln, fbc (fbclid) além de ph
 *  - calcLeadScore() exportado para recálculo retroativo
 *
 * Variáveis Railway:
 *   META_PIXEL_ID=1696937615068168
 *   META_CAPI_ACCESS_TOKEN=<token do Gerenciador de Eventos>
 */

import crypto from "crypto";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type CAPIEventName = "InitiateConversation" | "Lead" | "QualifiedLead" | "Purchase";

export type CAPIUserData = {
  phone:      string;
  name?:      string | null;   // usado para fn + ln com hash
  fbclid?:    string | null;   // formatado como fbc pelo helper
  fbclidTs?:  number;          // timestamp de captura do fbclid (segundos)
};

export type CAPIEventOptions = {
  userData:   CAPIUserData;
  eventId:    string;           // leadId — deduplicação no Meta
  leadId?:    string;
  storeId?:   string;
  score?:     number;
  saleValue?: number;           // Purchase: valor em BRL
  currency?:  string;
};

type CAPIResult = {
  success:         boolean;
  events_received: number;
  error?:          string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

function toE164Brazil(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

/** Constrói user_data com todos os campos disponíveis para máximo match quality */
function buildUserData(ud: CAPIUserData): Record<string, unknown> {
  const phoneE164 = toE164Brazil(ud.phone);
  const result: Record<string, unknown> = {
    ph: [sha256(phoneE164)],
  };

  // Nome → fn (first name) + ln (last name)
  if (ud.name?.trim()) {
    const parts = ud.name.trim().split(/\s+/);
    result.fn = [sha256(parts[0])];
    if (parts.length > 1) result.ln = [sha256(parts.slice(1).join(" "))];
  }

  // fbclid → fbc no formato Meta: fb.1.<timestamp>.<fbclid>
  if (ud.fbclid) {
    const ts = ud.fbclidTs ?? Math.floor(Date.now() / 1000);
    result.fbc = `fb.1.${ts}.${ud.fbclid}`;
  }

  return result;
}

// ── Deduplicação persistente no banco ────────────────────────────────────────
/** Retorna true se o evento JÁ foi enviado para este lead (check no banco). */
async function isAlreadySent(leadId: string, eventName: CAPIEventName): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("leads")
      .select("capi_events")
      .eq("id", leadId)
      .single();
    const events: string[] = data?.capi_events ?? [];
    return events.includes(eventName);
  } catch {
    return false; // falha silenciosa → permite envio (melhor duplicar que perder)
  }
}

/** Marca evento como enviado no array capi_events do lead. */
async function markAsSent(leadId: string, eventName: CAPIEventName): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    await supabaseAdmin.rpc("append_capi_event", { lead_id: leadId, event: eventName });
  } catch {
    // fallback: update direto se RPC não existir
    try {
      const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
      const { data } = await supabaseAdmin.from("leads").select("capi_events").eq("id", leadId).single();
      const current: string[] = data?.capi_events ?? [];
      if (!current.includes(eventName)) {
        await supabaseAdmin.from("leads").update({
          capi_events: [...current, eventName],
          capi_sent_at: new Date().toISOString(),
        }).eq("id", leadId);
      }
    } catch (e2) {
      console.error("[CAPI] ⚠️  markAsSent falhou:", e2);
    }
  }
}

// ── Core: envia evento para a Graph API ──────────────────────────────────────
async function sendEvent(
  eventName: CAPIEventName,
  opts:      CAPIEventOptions,
): Promise<CAPIResult> {
  const pixelId     = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.warn("[CAPI] ⚠️  META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN ausente");
    return { success: false, events_received: 0, error: "missing_env" };
  }

  // Deduplicação persistente (Lead, QualifiedLead, Purchase — não InitiateConversation)
  if (opts.leadId && eventName !== "InitiateConversation") {
    if (await isAlreadySent(opts.leadId, eventName)) {
      console.log(`[CAPI] ⏭️  ${eventName} já enviado para lead:${opts.leadId} — ignorado`);
      return { success: true, events_received: 0 };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventData: Record<string, any> = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: "other",
    event_id:      `${opts.eventId}_${eventName}`,
    user_data:     buildUserData(opts.userData),
    custom_data: {
      lead_score:  opts.score   ?? 0,
      lead_source: "whatsapp",
      currency:    opts.currency ?? "BRL",
    },
  };

  if (eventName === "Purchase" && opts.saleValue) {
    eventData.custom_data.value    = opts.saleValue;
    eventData.custom_data.currency = opts.currency ?? "BRL";
  }

  const payload = { data: [eventData] };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(10_000),
      },
    );

    const json = await res.json() as { events_received?: number; error?: { message: string } };

    if (!res.ok || json.error) {
      const errMsg = json.error?.message ?? `HTTP ${res.status}`;
      console.error(`[CAPI] ❌ ${eventName}:`, errMsg);
      await logCAPIEvent({ eventName, status: "error", errorMsg: errMsg, opts, payload });
      return { success: false, events_received: 0, error: errMsg };
    }

    const received = json.events_received ?? 0;
    console.log(`[CAPI] ✅ ${eventName} | score:${opts.score ?? "-"} | recebidos:${received}`);
    await logCAPIEvent({ eventName, status: "success", eventsReceived: received, opts, payload });

    // Marca como enviado no banco (só eventos únicos por lead)
    if (opts.leadId && eventName !== "InitiateConversation") {
      await markAsSent(opts.leadId, eventName);
    }

    return { success: true, events_received: received };

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[CAPI] ❌ ${eventName} exceção:`, errMsg);
    await logCAPIEvent({ eventName, status: "error", errorMsg: errMsg, opts, payload });
    return { success: false, events_received: 0, error: errMsg };
  }
}

// ── Log no Supabase ───────────────────────────────────────────────────────────
async function logCAPIEvent(params: {
  eventName:       CAPIEventName;
  status:          "success" | "error";
  eventsReceived?: number;
  errorMsg?:       string;
  opts:            CAPIEventOptions;
  payload:         unknown;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    await supabaseAdmin.from("capi_logs").insert({
      store_id:        params.opts.storeId         ?? null,
      lead_id:         params.opts.leadId           ?? null,
      event_name:      params.eventName,
      status:          params.status,
      events_received: params.eventsReceived        ?? 0,
      error_msg:       params.errorMsg              ?? null,
      phone_hash:      sha256(toE164Brazil(params.opts.userData.phone)),
      payload:         params.payload,
    });
  } catch (e) {
    console.error("[CAPI] ⚠️  Erro ao salvar log:", e);
  }
}

// ── Score de qualificação (0-100) ─────────────────────────────────────────────
export function calcLeadScore(messages: string[]): number {
  const joined = messages.join(" ").toLowerCase();
  let score = 0;

  const perguntouPreco = [
    "quanto custa", "qual o preço", "qual o valor", "valor", "preço",
    "quanto tá", "qual o menor", "tá caro", "tá barato", "desconto",
  ];
  if (perguntouPreco.some(kw => joined.includes(kw))) score += 20;

  const financiamento = [
    "financiamento", "financiar", "parcelar", "parcela", "entrada",
    "simular", "simulação", "aprovação", "cpf", "cnh", "banco",
    "bv", "santander", "itaú", "bradesco", "crédito",
  ];
  if (financiamento.some(kw => joined.includes(kw))) score += 30;

  const visita = [
    "agendar", "visita", "visitar", "ir lá", "ir la", "quando posso",
    "posso ir", "quero ir", "endereço", "como chego", "onde fica",
    "horário", "horario", "quando abre", "pode me ligar", "me liga",
  ];
  if (visita.some(kw => joined.includes(kw))) score += 30;

  const intencao = [
    "quero comprar", "quero fechar", "vou levar", "quero esse",
    "pode reservar", "reserva pra mim", "fecha comigo", "vou comprar",
    "quero esse aí", "tô dentro", "bora fechar", "me manda o pix",
    "pago à vista", "pago a vista",
  ];
  if (intencao.some(kw => joined.includes(kw))) score += 20;

  return Math.min(score, 100);
}

// ── APIs públicas ─────────────────────────────────────────────────────────────

/** InitiateConversation — primeira mensagem de um novo lead */
export async function sendCAPIInitiateConversation(
  userData: CAPIUserData,
  eventId:  string,
  opts?:    Partial<Omit<CAPIEventOptions, "userData" | "eventId">>,
): Promise<void> {
  await sendEvent("InitiateConversation", { userData, eventId, ...opts });
}

/** Lead — contato inicial quente (keyword-based) */
export async function sendCAPILeadEvent(
  userData: CAPIUserData,
  eventId:  string,
  opts?:    Partial<Omit<CAPIEventOptions, "userData" | "eventId">>,
): Promise<void> {
  await sendEvent("Lead", { userData, eventId, ...opts });
}

/** QualifiedLead — score >= 70 */
export async function sendCAPIQualifiedLeadEvent(
  userData: CAPIUserData,
  eventId:  string,
  score:    number,
  opts?:    Partial<Omit<CAPIEventOptions, "userData" | "eventId">>,
): Promise<void> {
  await sendEvent("QualifiedLead", { userData, eventId, score, ...opts });
}

/** Purchase — venda fechada no CRM */
export async function sendCAPIPurchaseEvent(
  userData:   CAPIUserData,
  eventId:    string,
  saleValue?: number,
  opts?:      Partial<Omit<CAPIEventOptions, "userData" | "eventId">>,
): Promise<void> {
  await sendEvent("Purchase", { userData, eventId, saleValue, ...opts });
}
