import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionStoreId, RADAR_SCOPES } from "@/lib/radar/ig";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.redirect(new URL("/login", req.url));

  const appId = process.env.META_APP_ID;
  if (!appId) return NextResponse.redirect(new URL("/radar?error=META_APP_ID+n%C3%A3o+configurado", req.url));

  const state = randomUUID();
  const redirectUri = `${req.nextUrl.origin}/api/radar/callback`;
  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", RADAR_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("auth_type", "rerequest");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("radar_oauth_state", `${state}.${storeId}`, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/radar",
  });
  return res;
}
