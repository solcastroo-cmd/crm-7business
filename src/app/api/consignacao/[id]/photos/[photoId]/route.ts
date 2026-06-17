import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { photoId } = await params;
  const { label } = await req.json();

  const { data, error } = await supabaseAdmin
    .from("consignment_photos")
    .update({ label })
    .eq("id", photoId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { photoId } = await params;

  const { data: photo } = await supabaseAdmin
    .from("consignment_photos")
    .select("url")
    .eq("id", photoId)
    .single();

  if (photo?.url) {
    const path = photo.url.split("/consignment-photos/")[1];
    if (path) await supabaseAdmin.storage.from("consignment-photos").remove([path]);
  }

  const { error } = await supabaseAdmin
    .from("consignment_photos")
    .delete()
    .eq("id", photoId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
