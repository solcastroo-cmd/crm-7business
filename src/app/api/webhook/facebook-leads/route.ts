/**
 * GET  /api/webhook/facebook-leads?userId=xxx  → verificação do webhook Meta (hub.challenge)
 * POST /api/webhook/facebook-leads?userId=xxx  → recebe leads do Facebook Lead Ads
 *
 * Como configurar no Facebook:
 * 1. Acesse developers.facebook.com → seu App → Webhooks
 * 2. Adicione o produto "Leads" ou "Page"
 * 3. URL do webhook: https://SEU_DOMINIO/api/webhook/facebook-leads?userId=USER_ID
 * 4. Verify Token: use o token exibido na tela de integração do CRM
 * 5. Subscribe aos campos: leadgen
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ─── GET: verificação do webhook Meta ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  const mode      = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");
  const verify    = searchParams.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge || !verify || !userId) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }

  // Verifica o token salvo no banco
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("fb_lead_verify_token, fb_leads_active")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.fb_leads_active || user.fb_lead_verify_token !== verify) {
    return new NextResponse("Token inválido", { status: 403 });
  }

  // Retorna o challenge como texto puro (exigência do Meta)
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

// ─── POST: recebe lead ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId obrigatório na URL" }, { status: 400 });
  }

  // Verifica se o usuário tem a integração ativa
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, fb_page_access_token, fb_leads_active")
    .eq("id", userId)
    .eq("fb_leads_active", true)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "Integração não ativa" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Estrutura padrão do Facebook Lead Ads webhook:
  // { "object": "page", "entry": [{ "changes": [{ "field": "leadgen", "value": { "leadgen_id": "...", "page_id": "...", "form_id": "..." } }] }] }
  const entries = (body.entry as Array<{
    changes?: Array<{
      field?: string;
      value?: { leadgen_id?: string; page_id?: string; form_id?: string };
    }>;
  }>) ?? [];

  let leadsCreated = 0;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId || !user.fb_page_access_token) continue;

      // Busca os dados completos do lead na Graph API
      try {
        const leadRes = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data,created_time&access_token=${user.fb_page_access_token}`,
          { signal: AbortSignal.timeout(10_000) }
        );
        const leadData = await leadRes.json() as {
          field_data?: Array<{ name: string; values: string[] }>;
          error?: Record<string, unknown>;
        };

        if (leadData.error) {
          console.error("[FB Leads] Erro ao buscar lead:", leadData.error);
          continue;
        }

        // Extrai campos do formulário
        const fields = leadData.field_data ?? [];
        const get = (key: string) =>
          fields.find(f =>
            f.name.toLowerCase().includes(key.toLowerCase())
          )?.values?.[0] ?? null;

        const name  = get("full_name") || get("nome") || get("first_name") || "Lead Facebook";
        const phone = get("phone_number") || get("telefone") || get("phone") || get("celular") || "";
        const email = get("email") || "";

        if (!phone) {
          console.warn(`[FB Leads] Lead ${leadgenId} sem telefone — ignorado`);
          continue;
        }

        const cleanPhone = phone.replace(/\D/g, "");
        const notes = email ? `E-mail: ${email} | Facebook Lead Ads` : "Facebook Lead Ads";

        const { error: insertErr } = await supabaseAdmin.from("leads").insert({
          phone:   cleanPhone,
          name:    name,
          source:  "facebook",
          stage:   "Novo Lead",
          budget:  notes,
          user_id: user.id,
        });

        if (insertErr) {
          console.error("[FB Leads] Erro ao inserir lead:", insertErr.message);
        } else {
          leadsCreated++;
          console.log(`[FB Leads] Lead criado — ${name} | ${cleanPhone}`);
        }
      } catch (err) {
        console.error("[FB Leads] Erro ao processar leadgen_id:", leadgenId, err);
      }
    }
  }

  return NextResponse.json({ ok: true, leads_created: leadsCreated });
}
