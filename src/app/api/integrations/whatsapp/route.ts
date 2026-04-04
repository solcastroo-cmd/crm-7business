/**
 * POST /api/integrations/whatsapp
 *
 * Recebe um Permanent Access Token do cliente, valida na Meta API
 * e salva na tabela users do Supabase.
 *
 * Segurança:
 *   - Token validado ANTES de ser salvo (chamada GET /me na Meta)
 *   - Token nunca é logado em texto plano
 *   - userId gerado pelo servidor se não fornecido
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v19.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type MetaMeResponse = {
  id:   string;
  name: string;
  error?: { message: string; code: number };
};

type WAPhoneResponse = {
  data: Array<{ id: string; display_phone_number: string; verified_name: string }>;
  error?: { message: string };
};

export async function POST(req: NextRequest) {
  // ── 1. Parse e validação de entrada ────────────────────────────────────────
  let body: { userId?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { userId, token } = body;

  if (!token || typeof token !== "string" || token.trim().length < 20) {
    return NextResponse.json(
      { error: "Token inválido ou muito curto" },
      { status: 400 }
    );
  }

  const cleanToken = token.trim();

  // ── 2. Valida token na Meta API ─────────────────────────────────────────────
  let metaUserId: string;
  try {
    const meRes  = await fetch(`${GRAPH}/me?access_token=${cleanToken}`, {
      signal: AbortSignal.timeout(8000),
    });
    const meData = await meRes.json() as MetaMeResponse;

    if (!meRes.ok || meData.error) {
      const errMsg = meData.error?.message ?? "Token rejeitado pela Meta";
      const code   = meData.error?.code;

      // Erros comuns com mensagem amigável
      if (code === 190) {
        return NextResponse.json(
          { error: "Token inválido ou expirado. Gere um novo no Meta for Developers." },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: errMsg }, { status: 401 });
    }

    metaUserId = meData.id;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível validar o token. Verifique sua conexão." },
      { status: 502 }
    );
  }

  // ── 3. Busca phone_number_id associado ao token ─────────────────────────────
  let phoneNumberId: string | null = null;
  let displayPhone:  string | null = null;
  let businessName:  string | null = null;

  try {
    // Busca WhatsApp Business Accounts
    const waRes = await fetch(
      `${GRAPH}/${metaUserId}/businesses?fields=id,name&access_token=${cleanToken}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const waData = await waRes.json() as { data?: Array<{ id: string; name: string }> };
    const business = waData.data?.[0];

    if (business) {
      businessName = business.name;

      // Busca contas WhatsApp Business
      const acctRes = await fetch(
        `${GRAPH}/${business.id}/owned_whatsapp_business_accounts?access_token=${cleanToken}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const acctData = await acctRes.json() as { data?: Array<{ id: string }> };
      const waAccountId = acctData.data?.[0]?.id;

      if (waAccountId) {
        const phoneRes = await fetch(
          `${GRAPH}/${waAccountId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${cleanToken}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const phoneData = await phoneRes.json() as WAPhoneResponse;
        phoneNumberId = phoneData.data?.[0]?.id                   ?? null;
        displayPhone  = phoneData.data?.[0]?.display_phone_number ?? null;
      }
    }
  } catch {
    // phone_number_id é opcional nesta etapa — usuário pode configurar depois
    console.warn("[WhatsApp] Não foi possível buscar phone_number_id automaticamente");
  }

  // ── 4. Salva ou atualiza no Supabase ────────────────────────────────────────
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!svcKey) {
    console.error("[WhatsApp] ❌ SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente");
    return NextResponse.json({ error: "Configuração do servidor incompleta (SUPABASE_SERVICE_ROLE_KEY ausente)" }, { status: 500 });
  }

  const db = supabaseAdmin;
  const expiresAt  = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // +60 dias estimado

  let savedUserId = userId;

  if (userId) {
    // Atualiza usuário existente
    const { error } = await db
      .from("users")
      .update({
        whatsapp_token:   cleanToken,
        token_expires_at: expiresAt,
        phone_number_id:  phoneNumberId,
        display_phone:    displayPhone,
        business_name:    businessName,
        business_id:      metaUserId,
      })
      .eq("id", userId);

    if (error) {
      console.error("[WhatsApp] ❌ Erro ao atualizar registro:", error.message, "| code:", error.code);
      return NextResponse.json({ error: `Erro ao salvar token: ${error.message}` }, { status: 500 });
    }
  } else {
    // Cria novo registro
    const { data, error } = await db
      .from("users")
      .insert([{
        whatsapp_token:   cleanToken,
        token_expires_at: expiresAt,
        phone_number_id:  phoneNumberId,
        display_phone:    displayPhone,
        business_name:    businessName,
        business_id:      metaUserId,
      }])
      .select("id")
      .single();

    if (error || !data) {
      const detail = error?.message ?? "data null";
      console.error("[WhatsApp] ❌ Erro ao criar registro:", detail, "| code:", error?.code);
      return NextResponse.json({ error: `Erro ao criar registro: ${detail}` }, { status: 500 });
    }
    savedUserId = data.id;
  }

  console.log(`[WhatsApp] ✅ Token salvo — userId: ${savedUserId}, número: ${displayPhone ?? "pendente"}`);

  return NextResponse.json({
    success:      true,
    userId:       savedUserId,
    displayPhone: displayPhone ?? "Número não detectado automaticamente",
    businessName: businessName,
    message:      "WhatsApp conectado com sucesso!",
  });
}

// ── DELETE /api/integrations/whatsapp — desconecta ───────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  }

  const db = supabaseAdmin;
  const { error } = await db
    .from("users")
    .update({
      whatsapp_token:   null,
      token_expires_at: null,
      phone_number_id:  null,
      display_phone:    null,
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "Erro ao desconectar" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "WhatsApp desconectado" });
}
