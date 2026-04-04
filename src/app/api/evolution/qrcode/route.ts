/**
 * GET /api/evolution/qrcode
 * Retorna o QR code base64 da Evolution API para exibir no card.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVO_URL  = process.env.EVOLUTION_API_URL  ?? "";
const EVO_KEY  = process.env.EVOLUTION_API_KEY   ?? "";
const EVO_INST = process.env.EVOLUTION_INSTANCE  ?? "PH_AUTOSCAR";

export async function GET() {
  if (!EVO_URL) {
    return NextResponse.json({ error: "EVOLUTION_API_URL não configurado" }, { status: 503 });
  }

  try {
    // 1. Estado da conexão
    const stateRes = await fetch(`${EVO_URL}/instance/connectionState/${EVO_INST}`, {
      headers: { apikey: EVO_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const stateData = await stateRes.json() as { instance?: { state?: string } };
    const state = stateData?.instance?.state ?? "unknown";

    if (state === "open") {
      // Já conectado — busca dados da instância
      const fetchRes = await fetch(
        `${EVO_URL}/instance/fetchInstances?instanceName=${EVO_INST}`,
        { headers: { apikey: EVO_KEY }, signal: AbortSignal.timeout(8000) }
      );
      const instances = await fetchRes.json() as Array<{
        name: string; connectionStatus: string; ownerJid?: string; profileName?: string
      }>;
      const inst = instances?.[0];
      return NextResponse.json({
        status: "connected",
        phone: inst?.ownerJid?.replace("@s.whatsapp.net", "") ?? null,
        profileName: inst?.profileName ?? null,
      });
    }

    // 2. Busca QR code
    const qrRes = await fetch(`${EVO_URL}/instance/connect/${EVO_INST}`, {
      headers: { apikey: EVO_KEY },
      signal: AbortSignal.timeout(10000),
    });
    const qrData = await qrRes.json() as { base64?: string; count?: number; pairingCode?: string };

    if (qrData?.base64) {
      return NextResponse.json({
        status: "qrcode",
        base64: qrData.base64,
        count: qrData.count ?? 0,
      });
    }

    // 3. QR ainda não gerado — informa estado atual
    return NextResponse.json({ status: state, count: qrData?.count ?? 0 });

  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao buscar QR code" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  if (!EVO_URL) return NextResponse.json({ error: "EVOLUTION_API_URL não configurado" }, { status: 503 });
  try {
    await fetch(`${EVO_URL}/instance/logout/${EVO_INST}`, {
      method: "DELETE",
      headers: { apikey: EVO_KEY },
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro ao desconectar" }, { status: 500 });
  }
}
