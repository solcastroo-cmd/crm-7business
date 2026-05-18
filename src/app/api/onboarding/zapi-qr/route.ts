/**
 * GET /api/onboarding/zapi-qr?instance=xxx&token=xxx&clientToken=xxx
 * Busca QR code e status da instância Z-API durante o onboarding.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ZAPI_BASE = "https://api.z-api.io/instances";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const instance    = searchParams.get("instance")    ?? "";
  const token       = searchParams.get("token")       ?? "";
  const clientToken = searchParams.get("clientToken") ?? "";

  if (!instance || !token || !clientToken) {
    return NextResponse.json({ error: "instance, token e clientToken são obrigatórios" }, { status: 400 });
  }

  try {
    // 1. Status da conexão
    const statusRes = await fetch(
      `${ZAPI_BASE}/${instance}/token/${token}/status`,
      {
        headers: { "Client-Token": clientToken },
        signal:  AbortSignal.timeout(8_000),
      }
    );

    if (!statusRes.ok) {
      return NextResponse.json({ error: "Credenciais inválidas. Verifique no painel Z-API." }, { status: 400 });
    }

    const statusData = await statusRes.json() as { value?: { connected?: boolean; number?: string } };

    if (statusData?.value?.connected) {
      return NextResponse.json({
        status: "connected",
        phone:  statusData.value.number ?? null,
      });
    }

    // 2. Busca QR code
    const qrRes = await fetch(
      `${ZAPI_BASE}/${instance}/token/${token}/qrcode`,
      {
        headers: { "Client-Token": clientToken },
        signal:  AbortSignal.timeout(10_000),
      }
    );

    if (!qrRes.ok) {
      return NextResponse.json({ status: "waiting", message: "Aguardando QR code..." });
    }

    // Z-API retorna imagem PNG diretamente
    const contentType = qrRes.headers.get("content-type") ?? "";
    if (contentType.includes("image")) {
      const buffer = await qrRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return NextResponse.json({
        status: "qrcode",
        base64: `data:image/png;base64,${base64}`,
      });
    }

    // Pode retornar JSON com base64
    const qrData = await qrRes.json().catch(() => null) as { value?: string } | null;
    if (qrData?.value) {
      const b64 = qrData.value.startsWith("data:") ? qrData.value : `data:image/png;base64,${qrData.value}`;
      return NextResponse.json({ status: "qrcode", base64: b64 });
    }

    return NextResponse.json({ status: "waiting", message: "Gerando QR code..." });

  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao buscar QR" }, { status: 500 });
  }
}
