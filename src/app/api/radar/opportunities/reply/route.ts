import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionStoreId, graph } from "@/lib/radar/ig";

export const dynamic = "force-dynamic";

// Resposta privada (DM) a um comentário — 1 por comentário, em até 7 dias, enviada só após clique do usuário.
export async function POST(req: NextRequest) {
  const storeId = await getSessionStoreId();
  if (!storeId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id, message } = (await req.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!id || !message?.trim()) return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });

  const { data: o } = await supabaseAdmin.from("radar_opportunities").select("source, ig_comment_id, detected_at, replied_at").eq("id", id).eq("store_id", storeId).maybeSingle();
  if (!o) return NextResponse.json({ error: "Oportunidade não encontrada" }, { status: 404 });
  if (o.source !== "comentario") return NextResponse.json({ error: "Resposta privada só vale para comentários" }, { status: 400 });
  if (o.replied_at) return NextResponse.json({ error: "Este comentário já recebeu resposta privada" }, { status: 409 });
  if (Date.now() - new Date(o.detected_at).getTime() > 7 * 24 * 3600 * 1000) {
    return NextResponse.json({ error: "Passaram mais de 7 dias: a Meta não permite mais resposta privada" }, { status: 400 });
  }

  const { data: conn } = await supabaseAdmin.from("radar_connections").select("ig_id, page_token").eq("store_id", storeId).maybeSingle();
  if (!conn) return NextResponse.json({ error: "Instagram não conectado" }, { status: 400 });

  try {
    await graph(`${conn.ig_id}/messages`, conn.page_token, {}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: o.ig_comment_id }, message: { text: message.trim().slice(0, 900) } }),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  await supabaseAdmin.from("radar_opportunities").update({ replied_at: new Date().toISOString(), status: "em_revisao" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
