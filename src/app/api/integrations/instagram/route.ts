/**
 * POST   /api/integrations/instagram  → salva token do Instagram
 * GET    /api/integrations/instagram  → retorna status
 * DELETE /api/integrations/instagram  → desconecta
 *
 * Usa Instagram Graph API com Page Access Token (Meta Business).
 * O cliente obtém o token em: Meta Business Suite → Configurações → Tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v19.0";

// ─── GET: status ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ active: false, error: "userId obrigatório" }, { status: 400 });

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("instagram_token, instagram_account_id, instagram_username")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.instagram_token) return NextResponse.json({ active: false });

  return NextResponse.json({
    active: true,
    username: user.instagram_username ?? null,
    accountId: user.instagram_account_id ?? null,
  });
}

// ─── POST: salva token Instagram ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { userId?: string; token?: string; pageId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { userId, token, pageId } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  if (!token?.trim()) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  const cleanToken = token.trim();

  // valida token no Instagram Graph API
  let username: string | null = null;
  let accountId: string | null = null;

  try {
    // tenta pegar conta Instagram conectada à Page
    let url: string;
    if (pageId?.trim()) {
      url = `${GRAPH}/${pageId.trim()}?fields=instagram_business_account&access_token=${cleanToken}`;
    } else {
      url = `${GRAPH}/me?fields=instagram_business_account&access_token=${cleanToken}`;
    }

    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as {
      instagram_business_account?: { id: string };
      error?: { message: string };
    };

    if (data.error) {
      return NextResponse.json({ error: `Token inválido: ${data.error.message}` }, { status: 400 });
    }

    const igAccountId = data.instagram_business_account?.id;
    if (igAccountId) {
      accountId = igAccountId;
      // busca username
      const igRes  = await fetch(`${GRAPH}/${igAccountId}?fields=username,name&access_token=${cleanToken}`, {
        signal: AbortSignal.timeout(8000),
      });
      const igData = await igRes.json() as { username?: string; name?: string };
      username = igData.username ?? igData.name ?? null;
    }
  } catch {
    return NextResponse.json({ error: "Não foi possível validar o token no Instagram. Verifique e tente novamente." }, { status: 400 });
  }

  // salva no Supabase
  const { error } = await supabaseAdmin
    .from("users")
    .upsert({
      id: userId,
      instagram_token:      cleanToken,
      instagram_account_id: accountId,
      instagram_username:   username,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, username, accountId });
}

// ─── DELETE: desconecta ───────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ instagram_token: null, instagram_account_id: null, instagram_username: null })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
