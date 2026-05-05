/**
 * 📡 capi.ts — Meta Conversions API (CAPI)
 *
 * Envia evento "Lead" para o pixel Meta quando lead é qualificado como "quente".
 * Isso ensina o algoritmo de anúncios quem é um lead qualificado, otimizando
 * a campanha para encontrar pessoas com perfil semelhante.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * ⚠️  Variáveis obrigatórias no Railway:
 *   META_PIXEL_ID=<ID do pixel>
 *   META_CAPI_ACCESS_TOKEN=<Token gerado em Events Manager → API de Conversões>
 *
 * ⚠️  SQL recomendado no Supabase (deduplicação persistente):
 *   ALTER TABLE public.leads
 *     ADD COLUMN IF NOT EXISTS capi_sent_at timestamptz;
 */

import crypto from "crypto";

// ── Hash SHA-256 (padrão Meta para dados de usuário) ─────────────────────────
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

// ── Formata telefone em E.164 sem "+" (ex: "85999999999" → "5585999999999") ──
function toE164Brazil(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Já tem DDI 55
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Sem DDI — adiciona 55
  return `55${digits}`;
}

// ── Envia evento Lead via CAPI ────────────────────────────────────────────────
export async function sendCAPILeadEvent(
  phone:   string,
  eventId: string,   // usa leadId como event_id para deduplicação no Meta
): Promise<void> {
  const pixelId     = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.warn("[CAPI] ⚠️  META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN ausente — evento ignorado");
    return;
  }

  const phoneE164   = toE164Brazil(phone);
  const hashedPhone = sha256(phoneE164);

  const payload = {
    data: [
      {
        event_name:    "Lead",
        event_time:    Math.floor(Date.now() / 1000),
        action_source: "other",           // WhatsApp não é "website" nem "app"
        event_id:      eventId,           // deduplicação Meta — mesmo ID = evento ignorado
        user_data: {
          ph: [hashedPhone],              // hash SHA-256 do telefone E.164
        },
        custom_data: {
          lead_type: "QualifiedLead",     // identificador interno para relatórios
        },
      },
    ],
    // test_event_code: "TEST12345",      // descomente para testar no Events Manager
  };

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

    const result = await res.json() as { events_received?: number; error?: { message: string } };

    if (!res.ok || result.error) {
      console.error("[CAPI] ❌ Erro ao enviar evento Lead:", JSON.stringify(result));
      return;
    }

    console.log(
      `[CAPI] ✅ QualifiedLead enviado — phone:${phoneE164} | event_id:${eventId} | recebidos:${result.events_received ?? "?"}`,
    );
  } catch (e) {
    console.error("[CAPI] ❌ Exceção ao chamar Graph API:", e);
  }
}
