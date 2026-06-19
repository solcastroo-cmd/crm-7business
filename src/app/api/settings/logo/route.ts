import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file   = fd.get("file")   as File | null;
    const userId = fd.get("userId") as string | null;

    if (!file || !userId) {
      return NextResponse.json({ error: "file e userId são obrigatórios" }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Imagem deve ter no máximo 2 MB" }, { status: 400 });
    }

    const ext  = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${userId}/logo.${ext}`;
    const bytes = await file.arrayBuffer();

    // Remove logo antiga se existir
    await supabaseAdmin.storage.from("store-logos").remove([path]);

    const { error: upErr } = await supabaseAdmin.storage
      .from("store-logos")
      .upload(path, bytes, { contentType: file.type, upsert: true });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("store-logos")
      .getPublicUrl(path);

    // Salva URL no perfil — adiciona cache-buster para forçar reload
    const logoUrl = `${publicUrl}?t=${Date.now()}`;

    const { error: dbErr } = await supabaseAdmin
      .from("users")
      .update({ logo_url: logoUrl })
      .eq("id", userId);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

    return NextResponse.json({ logo_url: logoUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  // Remove qualquer extensão
  await Promise.allSettled([
    supabaseAdmin.storage.from("store-logos").remove([`${userId}/logo.png`]),
    supabaseAdmin.storage.from("store-logos").remove([`${userId}/logo.jpg`]),
    supabaseAdmin.storage.from("store-logos").remove([`${userId}/logo.jpeg`]),
    supabaseAdmin.storage.from("store-logos").remove([`${userId}/logo.webp`]),
  ]);

  await supabaseAdmin.from("users").update({ logo_url: null }).eq("id", userId);

  return NextResponse.json({ ok: true });
}
