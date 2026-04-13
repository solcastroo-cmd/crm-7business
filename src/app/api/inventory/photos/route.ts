/**
 * POST /api/inventory/photos?vehicleId=xxx
 * Recebe multipart/form-data com até 10 imagens,
 * salva no Supabase Storage e atualiza vehicles.photos[]
 *
 * DELETE /api/inventory/photos?vehicleId=xxx&url=...
 * Remove uma foto do storage e da lista
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BUCKET     = "vehicle-photos";
const MAX_PHOTOS = 10;
const MAX_SIZE   = 5 * 1024 * 1024; // 5 MB por arquivo
const ALLOWED    = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ─── POST: upload de fotos ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicleId");
  if (!vehicleId) return NextResponse.json({ error: "vehicleId obrigatório" }, { status: 400 });

  // Busca fotos atuais do veículo
  const { data: vehicle, error: fetchErr } = await supabaseAdmin
    .from("vehicles").select("photos").eq("id", vehicleId).maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const currentPhotos: string[] = vehicle?.photos ?? [];
  if (currentPhotos.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Máximo de ${MAX_PHOTOS} fotos atingido.` }, { status: 400 });
  }

  // Lê multipart
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const files = formData.getAll("photos") as File[];
  if (!files.length) return NextResponse.json({ error: "Nenhuma foto enviada" }, { status: 400 });

  const slots = MAX_PHOTOS - currentPhotos.length;
  const toUpload = files.slice(0, slots);
  const newUrls: string[] = [];

  for (const file of toUpload) {
    if (!ALLOWED.includes(file.type)) continue;
    if (file.size > MAX_SIZE) continue;

    const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buf  = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false });

    if (upErr) continue;

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    newUrls.push(publicUrl);
  }

  if (!newUrls.length) {
    return NextResponse.json({ error: "Nenhuma foto válida (max 5MB, jpg/png/webp)" }, { status: 400 });
  }

  const updatedPhotos = [...currentPhotos, ...newUrls];
  const { error: updateErr } = await supabaseAdmin
    .from("vehicles").update({ photos: updatedPhotos }).eq("id", vehicleId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ photos: updatedPhotos });
}

// ─── DELETE: remove uma foto ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicleId");
  const photoUrl  = searchParams.get("url");

  if (!vehicleId || !photoUrl) {
    return NextResponse.json({ error: "vehicleId e url são obrigatórios" }, { status: 400 });
  }

  // Extrai o path do storage da URL pública
  // URL format: https://xxx.supabase.co/storage/v1/object/public/vehicle-photos/PATH
  const marker = `/vehicle-photos/`;
  const idx    = photoUrl.indexOf(marker);
  if (idx !== -1) {
    const storagePath = photoUrl.slice(idx + marker.length);
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  }

  // Remove da lista no banco
  const { data: vehicle } = await supabaseAdmin
    .from("vehicles").select("photos").eq("id", vehicleId).maybeSingle();

  const updated = (vehicle?.photos ?? []).filter((p: string) => p !== photoUrl);
  await supabaseAdmin.from("vehicles").update({ photos: updated }).eq("id", vehicleId);

  return NextResponse.json({ photos: updated });
}
