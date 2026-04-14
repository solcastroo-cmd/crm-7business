/**
 * GET    /api/integrations/zapi?userId=xxx  → status da conexão
 * POST   /api/integrations/zapi             → salva instance + token + client-token
 * DELETE /api/integrations/zapi?userId=xxx  → desconecta / limpa credenciais
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ZAPI_BASE = "https://api.z-api.io/instances";

// ─── GET: status ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ active: false, error: "userId obrigatório" }, { status: 400 });

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("zapi_instance, zapi_token, zapi_client_token, zapi_phone")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.zapi_token) {
    return NextResponse.json({ active: false });
  }

  try {
    const res = await fetch(
      `${ZAPI_BASE}/${user.zapi_instance}/token/${user.zapi_token}/status`,
      {
        headers: { "Client-Token": user.zapi_client_token ?? "" },
        signal:  AbortSignal.timeout(8_000),
      }
    );
    const data = await res.json() as { value?: { connected?: boolean; number?: string } };
    const connected = data?.value?.connected === true;
    return NextResponse.json({
      active:   connected,
      phone:    data?.value?.number ?? user.zapi_phone ?? null,
      instance: user.zapi_instance,
    });
  } catch {
    // Retorna como ativo se credenciais estiverem salvas (API pode estar fora)
    return NextResponse.json({
      active:   true,
      status:   "saved",
      phone:    user.zapi_phone ?? null,
      instance: user.zapi_instance,
    });
  }
}

// ─── POST: salva credenciais ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { userId?: string; instance?: string; token?: string; clientToken?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { userId, instance, token, clientToken } = body;
  if (!userId)            return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  if (!instance?.trim()) return NextResponse.json({ error: "Instance ID obrigatório" }, { status: 400 });
  if (!token?.trim())    return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });
  if (!clientToken?.trim()) return NextResponse.json({ error: "Client-Token obrigatório" }, { status: 400 });

  const cleanInstance    = instance.trim();
  const cleanToken       = token.trim();
  const cleanClientToken = clientToken.trim();

  // Valida credenciais na API Z-API antes de salvar
  let phone: string | null = null;
  try {
    const res = await fetch(
      `${ZAPI_BASE}/${cleanInstance}/token/${cleanToken}/status`,
      {
        headers: { "Client-Token": cleanClientToken },
        signal:  AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Instance ID, Token ou Client-Token inválidos. Verifique no painel Z-API." },
        { status: 400 },
      );
    }
    const data = await res.json() as { value?: { connected?: boolean; number?: string } };
    phone = data?.value?.number ?? null;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conectar à API Z-API. Verifique as credenciais e tente novamente." },
      { status: 400 },
    );
  }

  // Salva no Supabase
  const { error } = await supabaseAdmin
    .from("users")
    .upsert(
      {
        id:                userId,
        zapi_instance:     cleanInstance,
        zapi_token:        cleanToken,
        zapi_client_token: cleanClientToken,
        zapi_phone:        phone,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, phone, instance: cleanInstance });
}

// ─── DELETE: desconecta ───────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      zapi_instance:     null,
      zapi_token:        null,
      zapi_client_token: null,
      zapi_phone:        null,
    })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
