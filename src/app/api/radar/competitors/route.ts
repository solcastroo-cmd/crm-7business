import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId } from "@/lib/radar/ig";

export const dynamic = "force-dynamic";

export async function GET() {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: comps } = await supabaseAdmin.from("radar_competitors")
    .select("id, username, followers_count, media_count, last_synced_at, last_error")
    .eq("store_id", storeId).eq("active", true).order("created_at");
  const { data: posts } = await supabaseAdmin.from("radar_competitor_posts")
    .select("competitor_id, permalink, like_count, comments_count, posted_at")
    .eq("store_id", storeId).order("posted_at", { ascending: false }).limit(400);

  const byComp = new Map<string, NonNullable<typeof posts>>();
  for (const p of posts ?? []) {
    const arr = byComp.get(p.competitor_id) ?? [];
    arr.push(p);
    byComp.set(p.competitor_id, arr);
  }
  const competitors = (comps ?? []).map(c => {
    const ps = byComp.get(c.id) ?? [];
    const top = [...ps].sort((a, b) => (b.like_count ?? 0) + (b.comments_count ?? 0) * 3 - ((a.like_count ?? 0) + (a.comments_count ?? 0) * 3))[0] ?? null;
    const avg = ps.length ? Math.round(ps.reduce((s, p) => s + (p.like_count ?? 0) + (p.comments_count ?? 0), 0) / ps.length) : null;
    return { ...c, avgEngagement: avg, topPost: top, postsCount: ps.length };
  });
  return NextResponse.json({ competitors });
}

export async function POST(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { username } = (await req.json().catch(() => ({}))) as { username?: string };
  const clean = (username ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(clean)) return NextResponse.json({ error: "Usuário do Instagram inválido" }, { status: 400 });
  const { error } = await supabaseAdmin.from("radar_competitors").upsert(
    { store_id: storeId, username: clean, active: true }, { onConflict: "store_id,username" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await supabaseAdmin.from("radar_competitors").update({ active: false }).eq("id", id).eq("store_id", storeId);
  return NextResponse.json({ ok: true });
}
