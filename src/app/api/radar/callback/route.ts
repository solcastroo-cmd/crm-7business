import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId, graph, GRAPH, RADAR_SCOPES } from "@/lib/radar/ig";
import { syncStore } from "@/lib/radar/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function back(req: NextRequest, qs: string) {
  const res = NextResponse.redirect(new URL(`/radar?${qs}`, req.url));
  res.cookies.delete("radar_oauth_state");
  return res;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(req, `error=${encodeURIComponent(sp.get("error_description") ?? "Acesso negado")}`);

  const code = sp.get("code");
  const state = sp.get("state");
  const cookie = req.cookies.get("radar_oauth_state")?.value ?? "";
  const storeId = await getSessionStoreId();
  if (!code || !state || !storeId || cookie !== `${state}.${storeId}`) {
    return back(req, "error=Sess%C3%A3o+inv%C3%A1lida+ou+expirada.+Tente+conectar+de+novo.");
  }

  const appId = process.env.META_APP_ID!;
  const secret = process.env.META_APP_SECRET!;
  const redirectUri = `${req.nextUrl.origin}/api/radar/callback`;

  try {
    const short = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: appId, client_secret: secret, redirect_uri: redirectUri, code,
    })).then(r => r.json()) as { access_token?: string; error?: { message: string } };
    if (!short.access_token) throw new Error(short.error?.message ?? "Falha ao trocar o código");

    const long = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token,
    })).then(r => r.json()) as { access_token?: string; expires_in?: number; error?: { message: string } };
    if (!long.access_token) throw new Error(long.error?.message ?? "Falha ao gerar token longo");

    const pages = await graph<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
      "me/accounts", long.access_token, { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50" });
    const page = (pages.data ?? []).find(p => p.instagram_business_account);
    if (!page?.instagram_business_account) {
      return back(req, "error=Nenhuma+P%C3%A1gina+com+Instagram+profissional+foi+liberada.+Na+janela+da+Meta%2C+marque+a+P%C3%A1gina+e+o+Instagram.");
    }

    const { error } = await supabaseAdmin.from("radar_connections").upsert({
      store_id: storeId,
      page_id: page.id,
      ig_id: page.instagram_business_account.id,
      ig_username: page.instagram_business_account.username ?? null,
      page_token: page.access_token,
      token_expires_at: null,
      scopes: RADAR_SCOPES.split(","),
      connected_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "store_id" });
    if (error) throw new Error(error.message);

    await syncStore(storeId).catch(() => null);
    return back(req, "connected=1");
  } catch (e) {
    return back(req, `error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
}
