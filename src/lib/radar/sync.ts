import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { graph } from "./ig";
import { classifyBatch, temperatureFromScore, type ClassifyInput } from "./intel";

type Conn = {
  store_id: string;
  page_id: string;
  ig_id: string;
  ig_username: string | null;
  page_token: string;
};

export type SyncResult = {
  novasOportunidades: number;
  concorrentes: number;
  erros: string[];
};

async function insertOpportunities(
  storeId: string,
  rows: { source: "comentario" | "dm"; key: string; ig_user_id: string | null; username: string; text: string; media_id: string | null; permalink: string | null; context: string | null; detected_at: string }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { data: existing } = await supabaseAdmin
    .from("radar_opportunities")
    .select("ig_comment_id")
    .eq("store_id", storeId)
    .in("ig_comment_id", rows.map(r => r.key));
  const seen = new Set((existing ?? []).map(e => e.ig_comment_id as string));
  const fresh = rows.filter(r => !seen.has(r.key));
  if (fresh.length === 0) return 0;

  const inputs: ClassifyInput[] = fresh.map(r => ({ id: r.key, username: r.username, text: r.text, context: r.context }));
  const classified = await classifyBatch(inputs);

  const now = new Date().toISOString();
  const payload = fresh.map(r => {
    const c = classified.get(r.key)!;
    return {
      store_id: storeId,
      source: r.source,
      ig_comment_id: r.key,
      ig_user_id: r.ig_user_id,
      username: r.username,
      text: r.text.slice(0, 1000),
      media_id: r.media_id,
      media_permalink: r.permalink,
      intent: c.intent,
      score: c.score,
      temperature: temperatureFromScore(c.score),
      vehicle_hint: c.vehicle_hint,
      summary: c.summary,
      next_step: c.next_step,
      status: c.intent === "outro" ? "descartado" : "novo",
      detected_at: r.detected_at,
      analyzed_at: now,
    };
  });
  const { error } = await supabaseAdmin.from("radar_opportunities").upsert(payload, { onConflict: "store_id,ig_comment_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return payload.filter(p => p.status === "novo").length;
}

// Contas da própria equipe da PHD não são oportunidades. Extras via RADAR_IGNORE="conta1,conta2".
const TEAM_ACCOUNTS = new Set(
  ["paulo_phdmotors", "adveduardomaia", "soraya_cordeiro_", ...(process.env.RADAR_IGNORE ?? "").split(",")]
    .map(s => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean),
);

async function syncComments(conn: Conn): Promise<number> {
  const media = await graph<{ data: { id: string; permalink: string; comments_count: number; caption?: string }[] }>(
    `${conn.ig_id}/media`, conn.page_token, { fields: "id,permalink,comments_count,caption", limit: "15" });
  const rows: Parameters<typeof insertOpportunities>[1] = [];
  for (const m of media.data ?? []) {
    if (!m.comments_count) continue;
    const cm = await graph<{ data: { id: string; username?: string; text?: string; timestamp: string; from?: { id: string; username?: string } }[] }>(
      `${m.id}/comments`, conn.page_token, { fields: "id,username,text,timestamp,from{id,username}", limit: "50" });
    for (const c of cm.data ?? []) {
      const username = c.username ?? c.from?.username ?? "";
      if (!c.text?.trim() || !username || username === conn.ig_username || TEAM_ACCOUNTS.has(username.toLowerCase())) continue;
      rows.push({
        source: "comentario", key: c.id, ig_user_id: c.from?.id ?? null, username, text: c.text,
        media_id: m.id, permalink: m.permalink, context: m.caption ?? null, detected_at: c.timestamp,
      });
    }
  }
  return insertOpportunities(conn.store_id, rows);
}

async function syncDMs(conn: Conn): Promise<number> {
  type Msg = { message?: string; created_time: string; from?: { id: string; username?: string } };
  // A Meta recusa listas grandes de conversas ("reduce the amount of data"): tenta tamanhos menores.
  let list: { data: { id: string; updated_time: string }[] } = { data: [] };
  let lastErr: Error | null = null;
  outer: for (const node of [conn.ig_id, conn.page_id]) {
    for (const limit of ["5", "2"]) {
      try {
        list = await graph(`${node}/conversations`, conn.page_token, { platform: "instagram", fields: "updated_time", limit }, undefined, 25_000);
        lastErr = null;
        break outer;
      } catch (e) { lastErr = e as Error; }
    }
  }
  if (lastErr) throw lastErr;
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = (list.data ?? []).filter(c => new Date(c.updated_time).getTime() >= since).slice(0, 8);
  const rows: Parameters<typeof insertOpportunities>[1] = [];
  for (const cv of recent) {
    let msgs: Msg[] = [];
    try {
      const d = await graph<{ messages?: { data: Msg[] } }>(cv.id, conn.page_token, { fields: "messages.limit(5){message,created_time,from}" });
      msgs = d.messages?.data ?? [];
    } catch { continue; }
    const customer = msgs.filter(m => m.from?.id && m.from.id !== conn.ig_id && m.message?.trim());
    if (customer.length === 0) continue;
    const who = customer[0].from!;
    if (TEAM_ACCOUNTS.has((who.username ?? "").toLowerCase())) continue;
    rows.push({
      source: "dm", key: `dm:${cv.id}`, ig_user_id: who.id, username: who.username ?? who.id,
      text: customer.slice(0, 3).map(m => m.message!.trim()).reverse().join(" / "),
      media_id: null, permalink: null, context: null, detected_at: customer[0].created_time,
    });
  }
  return insertOpportunities(conn.store_id, rows);
}

async function syncCompetitors(conn: Conn): Promise<number> {
  const { data: comps } = await supabaseAdmin
    .from("radar_competitors").select("id, username").eq("store_id", conn.store_id).eq("active", true).limit(15);
  let ok = 0;
  for (const c of comps ?? []) {
    try {
      const r = await graph<{ business_discovery: { followers_count?: number; media_count?: number; media?: { data: { id: string; permalink: string; like_count?: number; comments_count?: number; timestamp: string }[] } } }>(
        conn.ig_id, conn.page_token,
        { fields: `business_discovery.username(${c.username}){followers_count,media_count,media.limit(12){id,permalink,like_count,comments_count,timestamp}}` });
      const bd = r.business_discovery;
      await supabaseAdmin.from("radar_competitors").update({
        followers_count: bd.followers_count ?? null, media_count: bd.media_count ?? null,
        last_synced_at: new Date().toISOString(), last_error: null,
      }).eq("id", c.id);
      const posts = (bd.media?.data ?? []).map(p => ({
        store_id: conn.store_id, competitor_id: c.id, ig_media_id: p.id, permalink: p.permalink,
        like_count: p.like_count ?? 0, comments_count: p.comments_count ?? 0, posted_at: p.timestamp, synced_at: new Date().toISOString(),
      }));
      if (posts.length) await supabaseAdmin.from("radar_competitor_posts").upsert(posts, { onConflict: "store_id,ig_media_id" });
      ok++;
    } catch (e) {
      await supabaseAdmin.from("radar_competitors").update({
        last_synced_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 200),
      }).eq("id", c.id);
    }
  }
  return ok;
}

export async function syncStore(storeId: string): Promise<SyncResult> {
  const { data: conn } = await supabaseAdmin.from("radar_connections").select("*").eq("store_id", storeId).maybeSingle();
  const result: SyncResult = { novasOportunidades: 0, concorrentes: 0, erros: [] };
  if (!conn) { result.erros.push("Instagram não conectado"); return result; }

  try { result.novasOportunidades += await syncComments(conn as Conn); }
  catch (e) { result.erros.push(`Comentários: ${(e as Error).message}`); }
  try { result.concorrentes = await syncCompetitors(conn as Conn); }
  catch (e) { result.erros.push(`Concorrentes: ${(e as Error).message}`); }
  // DMs por último: a lista de conversas do Instagram é lenta e não pode atrasar o resto.
  try { result.novasOportunidades += await syncDMs(conn as Conn); }
  catch (e) { result.erros.push(`DMs: ${(e as Error).message}`); }

  await supabaseAdmin.from("radar_connections").update({
    last_sync_at: new Date().toISOString(),
    last_error: result.erros.length ? result.erros.join(" | ").slice(0, 400) : null,
  }).eq("store_id", storeId);
  return result;
}
