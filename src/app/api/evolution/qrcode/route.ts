/**
 * GET /api/evolution/qrcode
 * Retorna o QR code base64 da Evolution API para exibir no card.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVO_URL  = process.env.EVOLUTION_API_URL  ?? "";
const EVO_KEY  = process.env.EVOLUTION_API_KEY   ?? "";
const EVO_INST = process.env.EVOLUTION_INSTANCE  ?? "PH_AUTOSCAR";

/** fetch com timeout via AbortController (compatível com Node 18+) */
function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Garante que o base64 tenha prefixo de data URI para uso direto em <img src> */
function ensureDataUri(raw: string): string {
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

export async function GET() {
  if (!EVO_URL) {
    return NextResponse.json({ error: "EVOLUTION_API_URL não configurado" }, { status: 503 });
  }

  try {
    // 1. Estado da conexão
    const stateRes = await fetchWithTimeout(
      `${EVO_URL}/instance/connectionState/${EVO_INST}`,
      { headers: { apikey: EVO_KEY } },
      8_000,
    );
    const stateData = await stateRes.json() as { instance?: { state?: string } };
    const state = stateData?.instance?.state ?? "unknown";

    if (state === "open") {
      // Já conectado — busca dados da instância
      const fetchRes = await fetchWithTimeout(
        `${EVO_URL}/instance/fetchInstances?instanceName=${EVO_INST}`,
        { headers: { apikey: EVO_KEY } },
        8_000,
      );
      const instances = await fetchRes.json() as Array<{
        name: string; connectionStatus: string; ownerJid?: string; profileName?: string;
      }>;
      const inst = instances?.[0];
      return NextResponse.json({
        status: "connected",
        phone: inst?.ownerJid?.replace("@s.whatsapp.net", "") ?? null,
        profileName: inst?.profileName ?? null,
      });
    }

    // 2. Busca QR code
    const qrRes = await fetchWithTimeout(
      `${EVO_URL}/instance/connect/${EVO_INST}`,
      { headers: { apikey: EVO_KEY } },
      10_000,
    );
    const qrData = await qrRes.json() as { base64?: string; count?: number; pairingCode?: string };

    if (qrData?.base64) {
      return NextResponse.json({
        status: "qrcode",
        base64: ensureDataUri(qrData.base64),
        count: qrData.count ?? 0,
      });
    }

    // 3. QR ainda não gerado — informa estado atual
    return NextResponse.json({ status: state, count: qrData?.count ?? 0 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar QR code";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  if (!EVO_URL) return NextResponse.json({ error: "EVOLUTION_API_URL não configurado" }, { status: 503 });
  try {
    await fetchWithTimeout(
      `${EVO_URL}/instance/logout/${EVO_INST}`,
      { method: "DELETE", headers: { apikey: EVO_KEY } },
      8_000,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro ao desconectar" }, { status: 500 });
  }
}
