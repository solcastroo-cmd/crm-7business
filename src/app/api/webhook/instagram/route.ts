import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { graph } from "@/lib/radar/ig";
import { classifyBatch, temperatureFromScore } from "@/lib/radar/intel";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Só vale para o aperto de mão do cadastro do webhook; a segurança real é a assinatura do POST.
const VERIFY_TOKEN = process.env.IG_RADAR_VERIFY_TOKEN ?? "phd-radar-webhook-2026";

const TEAM = new Set(
  ["paulo_phdmotors", "adveduardomaia", "soraya_cordeiro_", ...(process.env.RADAR_IGNORE ?? "").split(",")]
    .map(s => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean),
);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === VERIFY_TOKEN) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

type Payload = {
  object?: string;
  entry?: {
    id: string;
    messaging?: { sender?: { id: string }; recipient?: { id: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } }[];
    changes?: { field?: string; value?: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } } }[];
  }[];
};

async function upsertOpportunity(
  storeId: string,
  o: { source: "comentario" | "dm"; key: string; igUserId: string | null; username: string; text: string; mediaId: string | null; permalink: string | null; at: string },
) {
  const { data: existing } = await supabaseAdmin.from("radar_opportunities")
    .select("id, status").eq("store_id", storeId).eq("ig_comment_id", o.key).maybeSingle();
  if (existing && existing.status === "convertido") return;

  const c = (await classifyBatch([{ id: o.key, username: o.username, text: o.text }])).get(o.key)!;
  const row = {
    store_id: storeId, source: o.source, ig_comment_id: o.key, ig_user_id: o.igUserId, username: o.username,
    text: o.text.slice(0, 1000), media_id: o.mediaId, media_permalink: o.permalink,
    intent: c.intent, score: c.score, temperature: temperatureFromScore(c.score),
    vehicle_hint: c.vehicle_hint, summary: c.summary, next_step: c.next_step,
    status: c.intent === "outro" ? "descartado" : "novo",
    detected_at: o.at, analyzed_at: new Date().toISOString(),
  };
  if (existing) await supabaseAdmin.from("radar_opportunities").update(row).eq("id", existing.id);
  else await supabaseAdmin.from("radar_opportunities").insert(row);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let body: Payload;
  try { body = JSON.parse(raw) as Payload; } catch { return NextResponse.json({ ok: true }); }
  if (body.object !== "instagram" && body.object !== "page") return NextResponse.json({ ok: true });

  for (const entry of body.entry ?? []) {
    const { data: conn } = await supabaseAdmin.from("radar_connections")
      .select("store_id, ig_id, ig_username, page_token").eq("ig_id", entry.id).maybeSingle();
    if (!conn) continue;

    try {
      for (const m of entry.messaging ?? []) {
        const senderId = m.sender?.id;
        const text = m.message?.text?.trim();
        if (!senderId || !text || m.message?.is_echo || senderId === conn.ig_id) continue;
        let username = senderId;
        try {
          const u = await graph<{ username?: string; name?: string }>(senderId, conn.page_token, { fields: "username,name" }, undefined, 8_000);
          username = u.username ?? u.name ?? senderId;
        } catch { /* usa o id */ }
        if (TEAM.has(username.toLowerCase())) continue;
        await upsertOpportunity(conn.store_id, {
          source: "dm", key: `dm:${senderId}`, igUserId: senderId, username, text, mediaId: null, permalink: null,
          at: new Date(m.timestamp ?? Date.now()).toISOString(),
        });
      }

      for (const ch of entry.changes ?? []) {
        if (ch.field !== "comments" || !ch.value?.id) continue;
        const v = ch.value;
        const commentId = v.id!;
        const username = v.from?.username ?? "";
        const text = v.text?.trim();
        if (!text || !username || username === conn.ig_username || TEAM.has(username.toLowerCase())) continue;
        let permalink: string | null = null;
        if (v.media?.id) {
          try { permalink = (await graph<{ permalink?: string }>(v.media.id, conn.page_token, { fields: "permalink" }, undefined, 8_000)).permalink ?? null; } catch { /* sem link */ }
        }
        await upsertOpportunity(conn.store_id, {
          source: "comentario", key: commentId, igUserId: v.from?.id ?? null, username, text,
          mediaId: v.media?.id ?? null, permalink, at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("[RADAR WEBHOOK]", (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true });
}
