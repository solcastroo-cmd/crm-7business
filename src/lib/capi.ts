/**
 * 📡 capi.ts — Meta Conversions API (CAPI) v2
 *
 * Eventos suportados:
 *  • Lead           → contato inicial qualificado (quente por keyword)
 *  • QualifiedLead  → lead com score >= 70 (alta intenção de compra)
 *  • Purchase       → venda fechada no CRM
 *
 * Todos os eventos são registrados em public.capi_logs para auditoria.
 *
 * Variáveis obrigatórias no Railway:
 *   META_PIXEL_ID=1696937615068168
 *   META_CAPI_ACCESS_TOKEN=<token do Gerenciador de Eventos>
 */

import crypto from "crypto";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type CAPIEventName = "Lead" | "QualifiedLead" | "Purchase";

export type CAPIEventOptions = {
  phone:       string;
  eventId:     string;       // leadId — garante deduplicação no Meta
  leadId?:     string;
  storeId?:    string;
  score?:      number;
  saleValue?:  number;       // só para Purchase — valor em BRL
  currency?:   string;
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

// ── Envia evento para a Graph API ─────────────────────────────────────────────
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

  const phoneE164   = toE164Brazil(opts.phone);
  const hashedPhone = sha256(phoneE164);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventData: Record<string, any> = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: "other",
    event_id:      `${opts.eventId}_${eventName}`,
    user_data: {
      ph: [hashedPhone],
    },
    custom_data: {
      lead_score:  opts.score  ?? 0,
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
      console.error(`[CAPI] ❌ ${eventName} erro:`, errMsg);
      await logCAPIEvent({ eventName, status: "error", errorMsg: errMsg, opts, payload });
      return { success: false, events_received: 0, error: errMsg };
    }

    const received = json.events_received ?? 0;
    console.log(`[CAPI] ✅ ${eventName} | phone:${phoneE164} | score:${opts.score ?? "-"} | recebidos:${received}`);
    await logCAPIEvent({ eventName, status: "success", eventsReceived: received, opts, payload });
    return { success: true, events_received: received };

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[CAPI] ❌ ${eventName} exceção:`, errMsg);
    await logCAPIEvent({ eventName, status: "error", errorMsg: errMsg, opts, payload });
    return { success: false, events_received: 0, error: errMsg };
  }
}

// ── Log no Supabase (não-bloqueante, nunca quebra o fluxo) ────────────────────
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
      store_id:        params.opts.storeId  ?? null,
      lead_id:         params.opts.leadId   ?? null,
      event_name:      params.eventName,
      status:          params.status,
      events_received: params.eventsReceived ?? 0,
      error_msg:       params.errorMsg       ?? null,
      phone_hash:      sha256(toE164Brazil(params.opts.phone)),
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

  // +20 — perguntou preço
  const perguntouPreco = [
    "quanto custa", "qual o preço", "qual o valor", "valor", "preço",
    "quanto tá", "qual o menor", "tá caro", "tá barato", "desconto",
  ];
  if (perguntouPreco.some(kw => joined.includes(kw))) score += 20;

  // +30 — financiamento / parcela / entrada
  const financiamento = [
    "financiamento", "financiar", "parcelar", "parcela", "entrada",
    "simular", "simulação", "aprovação", "cpf", "cnh", "banco",
    "bv", "santander", "itaú", "bradesco", "crédito",
  ];
  if (financiamento.some(kw => joined.includes(kw))) score += 30;

  // +30 — quer visitar / agendar
  const visita = [
    "agendar", "visita", "visitar", "ir lá", "ir la", "quando posso",
    "posso ir", "quero ir", "endereço", "como chego", "onde fica",
    "horário", "horario", "quando abre", "pode me ligar", "me liga",
  ];
  if (visita.some(kw => joined.includes(kw))) score += 30;

  // +20 — intenção de compra
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

/** Lead — contato inicial quente (keyword-based, retrocompatível) */
export async function sendCAPILeadEvent(
  phone:   string,
  eventId: string,
  opts?:   Partial<CAPIEventOptions>,
): Promise<void> {
  await sendEvent("Lead", { phone, eventId, ...opts });
}

/** QualifiedLead — score >= 70 ou intenção explícita confirmada pela IA */
export async function sendCAPIQualifiedLeadEvent(
  phone:   string,
  eventId: string,
  score:   number,
  opts?:   Partial<CAPIEventOptions>,
): Promise<void> {
  await sendEvent("QualifiedLead", { phone, eventId, score, ...opts });
}

/** Purchase — venda fechada no CRM (stage → "VENDIDO!") */
export async function sendCAPIPurchaseEvent(
  phone:      string,
  eventId:    string,
  saleValue?: number,
  opts?:      Partial<CAPIEventOptions>,
): Promise<void> {
  await sendEvent("Purchase", { phone, eventId, saleValue, ...opts });
}
