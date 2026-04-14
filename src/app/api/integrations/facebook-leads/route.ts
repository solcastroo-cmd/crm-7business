/**
 * GET    /api/integrations/facebook-leads?userId=xxx  → status
 * POST   /api/integrations/facebook-leads             → salva token + pageId
 * DELETE /api/integrations/facebook-leads?userId=xxx  → desativa
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ active: false, error: "userId obrigatório" }, { status: 400 });

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("fb_page_access_token, fb_page_id, fb_lead_verify_token, fb_leads_active")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.fb_leads_active || !user?.fb_page_access_token) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active:       true,
    pageId:       user.fb_page_id ?? null,
    verifyToken:  user.fb_lead_verify_token ?? null,
  });
}

export async function POST(req: NextRequest) {
  let body: { userId?: string; pageAccessToken?: string; pageId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { userId, pageAccessToken, pageId } = body;
  if (!userId)           return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  if (!pageAccessToken?.trim()) return NextResponse.json({ error: "Page Access Token obrigatório" }, { status: 400 });

  // Valida token na Graph API
  let pageName: string | null = null;
  try {
    const url = pageId?.trim()
      ? `https://graph.facebook.com/v19.0/${pageId.trim()}?fields=name&access_token=${pageAccessToken.trim()}`
      : `https://graph.facebook.com/v19.0/me?fields=name&access_token=${pageAccessToken.trim()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const data = await res.json() as Record<string, unknown>;
    if (data.error) {
      const e = data.error as Record<string, unknown>;
      return NextResponse.json({ error: `Meta API: ${e.message}` }, { status: 400 });
    }
    pageName = (data.name as string) ?? null;
  } catch {
    return NextResponse.json({ error: "Timeout ao validar token na Meta API." }, { status: 400 });
  }

  // Gera ou reutiliza verify_token para o webhook
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("fb_lead_verify_token")
    .eq("id", userId)
    .maybeSingle();

  const verifyToken = existing?.fb_lead_verify_token || randomBytes(20).toString("hex");

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      fb_page_access_token: pageAccessToken.trim(),
      fb_page_id:           pageId?.trim() || null,
      fb_lead_verify_token: verifyToken,
      fb_leads_active:      true,
    })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ active: true, pageName, verifyToken });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ fb_leads_active: false, fb_page_access_token: null })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ active: false });
}
