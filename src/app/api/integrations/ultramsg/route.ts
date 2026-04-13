/**
 * POST   /api/integrations/ultramsg  → salva instância + token
 * GET    /api/integrations/ultramsg  → retorna status da conexão
 * DELETE /api/integrations/ultramsg  → desconecta / limpa token
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ULTRAMSG_BASE = "https://api.ultramsg.com";

// ─── GET: status ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ active: false, error: "userId obrigatório" }, { status: 400 });

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("ultramsg_instance, ultramsg_token, ultramsg_phone")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.ultramsg_token) {
    return NextResponse.json({ active: false });
  }

  // verifica na API UltraMsg se a instância está conectada
  try {
    const res = await fetch(
      `${ULTRAMSG_BASE}/${user.ultramsg_instance}/instance/status?token=${user.ultramsg_token}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json() as { status?: { accountStatus?: { status?: string }; }; instance_status?: string; };
    const status = data?.status?.accountStatus?.status ?? data?.instance_status ?? "unknown";
    const connected = status === "authenticated" || status === "connected";
    return NextResponse.json({
      active: connected,
      status,
      phone: user.ultramsg_phone ?? null,
      instance: user.ultramsg_instance,
    });
  } catch {
    // retorna como ativo se tiver token salvo (API pode estar fora)
    return NextResponse.json({
      active: true,
      status: "saved",
      phone: user.ultramsg_phone ?? null,
      instance: user.ultramsg_instance,
    });
  }
}

// ─── POST: salva instância + token ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { userId?: string; instance?: string; token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { userId, instance, token } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  if (!instance?.trim()) return NextResponse.json({ error: "Instance ID obrigatório" }, { status: 400 });
  if (!token?.trim()) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  const cleanInstance = instance.trim();
  const cleanToken    = token.trim();

  // valida na API UltraMsg
  let phone: string | null = null;
  try {
    const res = await fetch(
      `${ULTRAMSG_BASE}/${cleanInstance}/instance/status?token=${cleanToken}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Instância ou Token inválidos. Verifique no painel UltraMsg." }, { status: 400 });
    }
    const data = await res.json() as {
      status?: { accountStatus?: { status?: string; phoneConnected?: string } };
      instance_status?: string;
    };
    const status = data?.status?.accountStatus?.status ?? data?.instance_status ?? "";
    if (!["authenticated", "connected", "qr"].includes(status)) {
      // tenta salvar mesmo assim — instância pode estar conectando
    }
    phone = data?.status?.accountStatus?.phoneConnected ?? null;
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar à API UltraMsg. Verifique o Instance ID." }, { status: 400 });
  }

  // salva no Supabase
  const { error } = await supabaseAdmin
    .from("users")
    .upsert({
      id: userId,
      ultramsg_instance: cleanInstance,
      ultramsg_token:    cleanToken,
      ultramsg_phone:    phone,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

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
    .update({ ultramsg_instance: null, ultramsg_token: null, ultramsg_phone: null })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
