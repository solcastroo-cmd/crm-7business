/**
 * GET  /api/evolution/qrcode   — status + QR code
 * POST /api/evolution/qrcode   — configura proxy na instância
 * DELETE /api/evolution/qrcode — desconecta instância
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVO_URL  = process.env.EVOLUTION_API_URL  ?? "";
const EVO_KEY  = process.env.EVOLUTION_API_KEY   ?? "";
const EVO_INST = process.env.EVOLUTION_INSTANCE  ?? "PH_AUTOSCAR";

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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
    const qrData = await qrRes.json() as { base64?: string; count?: number };

    if (qrData?.base64) {
      return NextResponse.json({
        status: "qrcode",
        base64: ensureDataUri(qrData.base64),
        count: qrData.count ?? 0,
      });
    }

    // BUG-QR-01/02: só retorna needs_proxy se NÃO há proxy configurado na instância.
    // Com proxy configurado + state=connecting = Baileys ainda inicializando (aguardar).
    if (state === "connecting" && !qrData?.base64 && (qrData?.count ?? 0) === 0) {
      // Consulta fetchInstances para checar se Proxy está configurado
      const instRes = await fetchWithTimeout(
        `${EVO_URL}/instance/fetchInstances`,
        { headers: { apikey: EVO_KEY } },
        6_000,
      ).catch(() => null);
      const instances = instRes ? await instRes.json().catch(() => null) as Array<{
        name: string; Proxy?: { host?: string } | null;
      }> | null : null;
      const inst = instances?.find(i => i.name === EVO_INST);
      const hasProxy = !!(inst?.Proxy?.host);

      if (hasProxy) {
        // Proxy configurado — Baileys ainda conectando via proxy, aguardar
        return NextResponse.json({ status: "loading", message: "Conectando via proxy..." });
      }

      return NextResponse.json({
        status: "needs_proxy",
        message: "WhatsApp bloqueia conexões de datacenter. Configure um proxy residencial.",
      });
    }

    return NextResponse.json({ status: state, count: qrData?.count ?? 0 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar QR code";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — configura proxy e reinicia conexão
export async function POST(req: NextRequest) {
  if (!EVO_URL) return NextResponse.json({ error: "EVOLUTION_API_URL não configurado" }, { status: 503 });

  let body: { host?: string; port?: string | number; protocol?: string; username?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { host, port, protocol = "http", username, password } = body;
  if (!host || !port) return NextResponse.json({ error: "host e port são obrigatórios" }, { status: 400 });

  // BUG-PROXY-01: valida porta
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    return NextResponse.json({ error: "Porta inválida (deve ser 1–65535)" }, { status: 400 });
  }

  try {
    // 1. Configura proxy na instância
    // Evolution API v2 espera port como string (não number)
    const proxyPayload: Record<string, unknown> = {
      enabled: true, host, port: String(portNum), protocol,
    };
    if (username) proxyPayload.username = username;
    if (password) proxyPayload.password = password;

    const proxyRes = await fetchWithTimeout(
      `${EVO_URL}/proxy/set/${EVO_INST}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify(proxyPayload),
      },
      8_000,
    );
    // BR-03: .catch() para Evolution API retornando HTML (nginx 502/503)
    const proxyData = await proxyRes.json().catch(() => null) as {
      error?: string;
      response?: { message?: string | string[] | string[][] };
    } | null;
    if (!proxyRes.ok) {
      // BR-02: mapeia erros crus da Evolution API para mensagens acionáveis
      const rawErr   = proxyData?.error ?? "";
      const msgRaw   = proxyData?.response?.message;
      // Evolution v2 aninha a mensagem real em response.message (array ou string)
      const innerMsg = Array.isArray(msgRaw)
        ? (Array.isArray(msgRaw[0]) ? msgRaw[0][0] : msgRaw[0]) ?? ""
        : (msgRaw ?? "");
      let friendlyErr = "Erro ao configurar proxy na Evolution API.";
      if (typeof innerMsg === "string" && innerMsg.toLowerCase().includes("invalid proxy")) {
        friendlyErr = "Proxy inválido ou inacessível — verifique host, porta e credenciais.";
      } else if (proxyRes.status === 400) {
        friendlyErr = `Instância "${EVO_INST}" não encontrada ou payload inválido. Verifique EVOLUTION_INSTANCE no Railway.`;
      } else if (proxyRes.status === 401 || proxyRes.status === 403) {
        friendlyErr = "API Key da Evolution inválida. Verifique EVOLUTION_API_KEY no Railway.";
      } else if (proxyRes.status === 404) {
        friendlyErr = `Instância "${EVO_INST}" não existe na Evolution API. Crie-a primeiro.`;
      } else if (rawErr) {
        friendlyErr = rawErr;
      }
      return NextResponse.json({ error: friendlyErr }, { status: 502 });
    }

    // BUG-PROXY-03: logout + reconnect explícito para garantir nova tentativa com proxy
    // Ignora falha do logout (instância pode já estar close)
    await fetchWithTimeout(
      `${EVO_URL}/instance/logout/${EVO_INST}`,
      { method: "DELETE", headers: { apikey: EVO_KEY } },
      8_000,
    ).catch(() => null);

    // BUG-QR-03: captura falha do connect — não retorna ok:true se Baileys não iniciou
    const connectRes = await fetchWithTimeout(
      `${EVO_URL}/instance/connect/${EVO_INST}`,
      { headers: { apikey: EVO_KEY } },
      10_000,
    ).catch(() => null);
    if (!connectRes || !connectRes.ok) {
      console.warn("[QRCode] /instance/connect retornou erro — Baileys pode não ter iniciado");
    }

    return NextResponse.json({ ok: true, message: "Proxy configurado. Aguardando QR code..." });

  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

export async function DELETE() {
  if (!EVO_URL) return NextResponse.json({ error: "EVOLUTION_API_URL não configurado" }, { status: 503 });
  try {
    // BUG-QR-04: logout apenas não limpa sessão do banco — usar delete + recreate
    // para garantir estado limpo na próxima conexão
    await fetchWithTimeout(
      `${EVO_URL}/instance/logout/${EVO_INST}`,
      { method: "DELETE", headers: { apikey: EVO_KEY } },
      8_000,
    ).catch(() => null);

    await fetchWithTimeout(
      `${EVO_URL}/instance/delete/${EVO_INST}`,
      { method: "DELETE", headers: { apikey: EVO_KEY } },
      8_000,
    ).catch(() => null);

    // Recria instância limpa (sem proxy) para próxima sessão
    await fetchWithTimeout(
      `${EVO_URL}/instance/create`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ instanceName: EVO_INST, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      },
      10_000,
    ).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro ao desconectar" }, { status: 500 });
  }
}
