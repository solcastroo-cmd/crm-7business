import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { instagramService, InstagramPublishError } from "@/lib/instagramService";

export const dynamic = "force-dynamic";

// só JPEG é aceito pelo Instagram Content Publishing API
function isJpeg(url: string) {
  return /\.jpe?g($|\?)/i.test(url);
}

export async function POST(req: NextRequest) {
  let body: { vehicleId?: string; userId?: string; caption?: string; photos?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { vehicleId, userId, caption } = body;
  if (!vehicleId || !userId) {
    return NextResponse.json({ error: "vehicleId e userId são obrigatórios" }, { status: 400 });
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("instagram_token, instagram_account_id")
    .eq("id", userId)
    .maybeSingle();

  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!user?.instagram_token || !user?.instagram_account_id) {
    return NextResponse.json(
      { error: "Instagram não conectado. Conecte em Integrações antes de postar." },
      { status: 400 },
    );
  }

  const photos = body.photos ?? [];
  const jpegPhotos = photos.filter(isJpeg);
  if (jpegPhotos.length === 0) {
    return NextResponse.json(
      { error: "O Instagram só aceita fotos em JPEG. Nenhuma foto do veículo está nesse formato." },
      { status: 400 },
    );
  }

  try {
    const result = await instagramService.publishFeedPost({
      igUserId: user.instagram_account_id,
      token: user.instagram_token,
      imageUrls: jpegPhotos,
      caption: caption ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof InstagramPublishError ? e.message : "Erro ao postar no Instagram.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
