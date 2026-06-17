import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await params;

  const formData = await req.formData();
  const file  = formData.get("file") as File | null;
  const label = (formData.get("label") as string) || "Foto";
  const userId = formData.get("userId") as string | null;

  if (!file || !userId) {
    return NextResponse.json({ error: "file e userId obrigatórios" }, { status: 400 });
  }

  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${contractId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("consignment-photos")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage
    .from("consignment-photos")
    .getPublicUrl(path);

  const { data, error } = await supabaseAdmin
    .from("consignment_photos")
    .insert({ contract_id: contractId, url: urlData.publicUrl, label })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
