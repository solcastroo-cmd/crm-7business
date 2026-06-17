/**
 * Facebook Data Deletion Callback
 * Required by Meta for app Live mode
 * GET  /api/data-deletion  → returns deletion instructions page
 * POST /api/data-deletion  → handles data deletion request from Facebook
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Exclusão de Dados - PHD Motors CRM</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px">
  <h1>Exclusão de Dados</h1>
  <p>Para solicitar a exclusão dos seus dados coletados via Facebook, envie um e-mail para:</p>
  <p><strong>contato@phdmotors.com.br</strong></p>
  <p>Seu pedido será processado em até 30 dias.</p>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signedRequest = body?.signed_request;

    if (!signedRequest) {
      return NextResponse.json({ error: "signed_request obrigatório" }, { status: 400 });
    }

    // Decode the signed request (base64url)
    const [, payload] = signedRequest.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    );

    const userId = decoded?.user_id;

    // Optionally remove leads associated with this Facebook user
    if (userId) {
      await supabaseAdmin
        .from("leads")
        .delete()
        .eq("source", "facebook")
        .eq("user_id", userId);
    }

    const confirmationCode = `DEL-${Date.now()}-${userId ?? "unknown"}`;

    return NextResponse.json({
      url: "https://crm-7business-production.up.railway.app/api/data-deletion",
      confirmation_code: confirmationCode,
    });
  } catch {
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 });
  }
}
