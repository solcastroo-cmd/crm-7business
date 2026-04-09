"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams }                             from "next/navigation";

// ─── Lê userId do callback OAuth (?success=whatsapp&userId=xxx) ────────────────
function OAuthResultHandler({ onResult }: { onResult: (uid: string | null, err: string | null) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    const success = params.get("success");
    const uid     = params.get("userId");
    const err     = params.get("error");
    if (success === "whatsapp" && uid) onResult(uid, null);
    if (err) onResult(null, decodeURIComponent(err));
    // limpa URL sem reload
    window.history.replaceState({}, "", "/integrations");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ─── Card WhatsApp ────────────────────────────────────────────────────────────
function WhatsAppCard() {
  const [connected,     setConnected]     = useState(false);
  const [phone,         setPhone]         = useState<string | null>(null);
  const [bizName,       setBizName]       = useState<string | null>(null);
  const [daysLeft,      setDaysLeft]      = useState<number | null>(null);
  const [oauthError,    setOauthError]    = useState<string | null>(null);
  const [loadError,     setLoadError]     = useState<string | null>(null);  // BUG #1
  const [disconnecting, setDisconnecting] = useState(false);
  const [showManual,    setShowManual]    = useState(false);

  // ── token manual (fallback) ────────────────────────────────────────────────
  const [token,  setToken]  = useState("");
  const [saving, setSaving] = useState(false);
  const [tokenErr, setTokenErr] = useState<string | null>(null);

  // ── carrega status do Supabase ─────────────────────────────────────────────
  const loadStatus = useCallback(async (uid: string) => {
    setLoadError(null);
    try {
      const res  = await fetch(`/api/integrations?userId=${uid}`);
      // BUG #1: trata falha de rede/API em vez de engolir silenciosamente
      if (!res.ok) {
        setLoadError("Não foi possível verificar o status. Tente recarregar a página.");
        return;
      }
      const data = await res.json().catch(() => null);
      const wa   = data?.whatsapp;
      if (wa?.active) {
        setConnected(true);
        setPhone(wa.phone              ?? null);
        setDaysLeft(wa.days_left       ?? null);
        setBizName(wa.business_name    ?? null); // BUG #3: carrega bizName no reload
      } else {
        setConnected(false);
      }
    } catch {
      // BUG #1: erro de rede (offline, CORS, etc.) — mostra mensagem ao usuário
      setLoadError("Erro de rede ao verificar status. Verifique sua conexão.");
    }
  }, []);

  // ── ao montar: lê userId do localStorage ──────────────────────────────────
  useEffect(() => {
    const uid = localStorage.getItem("crm_userId");
    if (uid) loadStatus(uid);
  }, [loadStatus]);

  // ── callback do OAuthResultHandler ────────────────────────────────────────
  function handleOAuthResult(uid: string | null, err: string | null) {
    if (err) { setOauthError(err); return; }
    if (uid) {
      localStorage.setItem("crm_userId", uid);
      loadStatus(uid);
    }
  }

  // ── salva token manual ─────────────────────────────────────────────────────
  async function handleSaveManual() {
    if (!token.trim()) { setTokenErr("Cole o token antes de salvar."); return; }
    setTokenErr(null);
    setSaving(true);
    try {
      const uid  = localStorage.getItem("crm_userId");
      const body: Record<string, string> = { token: token.trim() };
      if (uid) body.userId = uid;
      const res  = await fetch("/api/integrations/whatsapp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data: Record<string, string> | null = await res.json().catch(() => null);
      if (!res.ok) { setTokenErr(data?.error ?? "Erro ao salvar."); return; }
      if (data?.userId) localStorage.setItem("crm_userId", data.userId);
      setPhone(data?.displayPhone  ?? null);
      setBizName(data?.businessName ?? null);
      setConnected(true);
      setToken("");
      setShowManual(false);
    } catch {
      setTokenErr("Erro de rede. Verifique sua conexão.");
    } finally {
      setSaving(false);
    }
  }

  // ── desconecta ─────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    const uid = localStorage.getItem("crm_userId");
    if (!uid) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/integrations/whatsapp?userId=${uid}`, { method: "DELETE" });
      // BUG #2: só atualiza UI se o DELETE teve sucesso no servidor
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setTokenErr(data?.error ?? "Erro ao desconectar. Tente novamente.");
        return;
      }
      setConnected(false);
      setPhone(null);
      setBizName(null);
      setDaysLeft(null);
    } catch {
      setTokenErr("Erro de rede ao desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }

  const tokenWarning = daysLeft !== null && daysLeft < 7;
  const tokenExpired = daysLeft !== null && daysLeft <= 0;
  const isPermanent  = daysLeft === null && connected;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Suspense fallback={null}>
        <OAuthResultHandler onResult={handleOAuthResult} />
      </Suspense>

      <div className={`rounded-2xl p-6 flex flex-col gap-4 border ${
        connected
          ? tokenExpired  ? "bg-red-50 border-red-300"
          : tokenWarning  ? "bg-yellow-50 border-yellow-300"
          : "bg-green-50 border-green-300"
          : "bg-blue-50 border-blue-300"
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <div>
              <h2 className={`text-sm font-bold ${connected ? "text-green-800" : "text-blue-800"}`}>
                WhatsApp Business
              </h2>
              <p className={`text-xs ${connected ? "text-green-600" : "text-blue-500"}`}>
                {connected ? "Meta Business API" : "Clique para conectar"}
              </p>
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${
            connected
              ? tokenExpired  ? "bg-red-100 text-red-700 border-red-300"
              : tokenWarning  ? "bg-yellow-100 text-yellow-700 border-yellow-300"
              : isPermanent   ? "bg-green-100 text-green-700 border-green-300"
              : "bg-green-100 text-green-700 border-green-300"
              : "bg-blue-100 text-blue-700 border-blue-300"
          }`}>
            {connected
              ? tokenExpired  ? "EXPIRADO"
              : tokenWarning  ? `⚠️ ${daysLeft}d`
              : isPermanent   ? "✅ PERMANENTE"
              : `✅ ${daysLeft}d`
              : "DESCONECTADO"}
          </span>
        </div>

        {/* ── ESTADO CONECTADO ─────────────────────────────────────────────── */}
        {connected && (
          <>
            <div className={`rounded-xl p-4 space-y-2 border ${
              tokenExpired ? "bg-white border-red-200"
              : tokenWarning ? "bg-white border-yellow-200"
              : "bg-white border-green-200"
            }`}>
              {phone   && <p className="text-xs text-gray-700"><span className="font-semibold">Número:</span> {phone}</p>}
              {bizName && <p className="text-xs text-gray-700"><span className="font-semibold">Empresa:</span> {bizName}</p>}
              <p className="text-xs text-gray-600">
                <span className="font-semibold">Token:</span>{" "}
                {tokenExpired  ? <span className="text-red-600 font-semibold">⚠️ Expirado — reconecte abaixo</span>
                : tokenWarning ? <span className="text-yellow-700">Expira em {daysLeft} dia(s)</span>
                : isPermanent  ? <span className="text-green-700">Permanente — nunca expira</span>
                : <span className="text-green-700">Válido por {daysLeft} dia(s)</span>}
              </p>
            </div>

            {!tokenExpired && (
              <div className="flex gap-2">
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-xs px-4 py-2 rounded-lg bg-white border border-red-300 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? "Desconectando..." : "Desconectar"}
                </button>
              </div>
            )}

            {(tokenExpired || tokenWarning) && (
              <a
                href="/api/meta/auth"
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-center"
              >
                🔄 Reconectar via Meta
              </a>
            )}
          </>
        )}

        {/* ── ERRO DE CARREGAMENTO (BUG #1) ───────────────────────────────── */}
        {loadError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            ⚠️ {loadError}
          </p>
        )}

        {/* ── ESTADO DESCONECTADO ──────────────────────────────────────────── */}
        {!connected && (
          <>
            {oauthError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                ⚠️ {oauthError}
              </p>
            )}

            {/* Botão OAuth — fluxo principal */}
            <a
              href="/api/meta/auth"
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Conectar com Meta
            </a>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-blue-200"/>
              <span className="text-xs text-blue-400">ou</span>
              <div className="flex-1 border-t border-blue-200"/>
            </div>

            {/* Toggle token manual */}
            <button
              onClick={() => setShowManual(v => !v)}
              className="text-xs text-blue-500 hover:text-blue-700 text-center transition-colors"
            >
              {showManual ? "▲ Ocultar token manual" : "▼ Colar token manualmente"}
            </button>

            {showManual && (
              <div className="space-y-3">
                {/* Guia 3 passos */}
                <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                    Como obter o System User Token (nunca expira)
                  </p>
                  {[
                    { n: 1, title: "Acesse Meta Business Manager",      desc: <>Vá em <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">business.facebook.com → Configurações → Usuários do Sistema</a></> },
                    { n: 2, title: "Crie um Usuário do Sistema",         desc: <>Clique em <strong>Adicionar</strong> → tipo <strong>Admin</strong> → atribua sua conta WhatsApp Business</> },
                    { n: 3, title: "Gere o Token e cole abaixo",         desc: <>Clique em <strong>Gerar Token</strong> → adicione as permissões <code className="bg-blue-50 px-1 rounded text-blue-700">whatsapp_business_messaging</code> → copie e cole</> },
                  ].map(({ n, title, desc }) => (
                    <div key={n} className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">{n}</span>
                      <div>
                        <p className="text-xs font-semibold text-blue-800">{title}</p>
                        <p className="text-xs text-blue-600 mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-xs font-semibold text-blue-700 mb-1.5 block">
                    System User Token
                  </label>
                  <textarea
                    value={token}
                    onChange={e => { setToken(e.target.value); setTokenErr(null); }}
                    placeholder="EAAGm0PX4ZApsBO..."
                    rows={3}
                    className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2.5 text-xs font-mono text-blue-900 placeholder-blue-300 resize-none focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {tokenErr && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    ⚠️ {tokenErr}
                  </p>
                )}

                <button
                  onClick={handleSaveManual}
                  disabled={saving || !token.trim()}
                  className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/>
                      </svg>
                      Validando na Meta...
                    </>
                  ) : "✅ Salvar Token"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── Card WhatsApp QR Code (Evolution API) ────────────────────────────────────
function WhatsAppQRCard() {
  type QRState = "idle" | "loading" | "qrcode" | "connected" | "error" | "needs_proxy";
  const [qrState,       setQRState]       = useState<QRState>("idle");
  const [qrBase64,      setQRBase64]      = useState<string | null>(null);
  const [phone,         setPhone]         = useState<string | null>(null);
  const [profile,       setProfile]       = useState<string | null>(null);
  const [errMsg,        setErrMsg]        = useState<string | null>(null);
  const [countdown,     setCountdown]     = useState(0);
  const [disconnecting, setDisconnecting] = useState(false);

  // Proxy form
  const [proxyHost,     setProxyHost]     = useState("");
  const [proxyPort,     setProxyPort]     = useState("");
  const [proxyUser,     setProxyUser]     = useState("");
  const [proxyPass,     setProxyPass]     = useState("");
  const [proxyProtocol, setProxyProtocol] = useState<"http" | "socks5">("http");
  const [proxySaving,   setProxySaving]   = useState(false);
  const [proxyErr,      setProxyErr]      = useState<string | null>(null);
  const [proxyOk,       setProxyOk]       = useState(false); // proxy salvo — aguardando QR

  const countdownRef    = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // BUG-CARD-01/02
  const proxyTimeoutRef = useRef<ReturnType<typeof setTimeout>  | null>(null); // BUG-CARD-03

  const POLL_INTERVAL = 4000;
  const QR_TIMEOUT    = 60;

  // BUG-CARD-01: limpa pollings ao desmontar o componente
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (proxyTimeoutRef.current) clearTimeout(proxyTimeoutRef.current);
    };
  }, []);

  const fetchQR = useCallback(async () => {
    try {
      const res  = await fetch("/api/evolution/qrcode");
      const data = await res.json() as {
        status?: string; base64?: string; count?: number;
        phone?: string; profileName?: string; error?: string; message?: string;
      };

      if (data.error) { setErrMsg(data.error); setQRState("error"); return; }

      if (data.status === "connected") {
        setQRState("connected");
        setPhone(data.phone ?? null);
        setProfile(data.profileName ?? null);
        setQRBase64(null);
        return;
      }

      if (data.status === "qrcode" && data.base64) {
        setQRBase64(data.base64);
        setQRState("qrcode");
        return;
      }

      // WhatsApp bloqueia IP de datacenter — exibe formulário de proxy
      if (data.status === "needs_proxy") {
        setQRState("needs_proxy");
        return;
      }

      setQRState("loading");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      const isCors = msg.toLowerCase().includes("failed to fetch");
      setErrMsg(
        isCors
          ? "Sem acesso ao servidor WhatsApp. Verifique se EVOLUTION_API_URL está configurado e acessível."
          : `Erro ao conectar: ${msg}`
      );
      setQRState("error");
    }
  }, []);

  async function handleSaveProxy() {
    if (!proxyHost.trim() || !proxyPort.trim()) { setProxyErr("Host e porta são obrigatórios."); return; }
    setProxyErr(null);
    setProxySaving(true);
    try {
      const res = await fetch("/api/evolution/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: proxyHost.trim(),
          port: Number(proxyPort.trim()),
          protocol: proxyProtocol,
          ...(proxyUser ? { username: proxyUser.trim() } : {}),
          ...(proxyPass ? { password: proxyPass.trim() } : {}),
        }),
      });
      // BUG-CARD-05: parse seguro — JSON inválido da Evolution API gera erro claro
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) { setProxyErr(data?.error ?? "Erro ao salvar proxy. Tente novamente."); return; }

      // Limpa campos sensíveis e sinaliza sucesso
      setProxyHost(""); setProxyPort(""); setProxyUser(""); setProxyPass("");
      setProxyOk(true);

      // BUG-CARD-02: cancela polling anterior antes de criar novo (evita concorrência)
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (proxyTimeoutRef.current) clearTimeout(proxyTimeoutRef.current);

      // Polling manual: busca QR a cada 4s
      pollIntervalRef.current = setInterval(async () => {
        const r = await fetch("/api/evolution/qrcode").catch(() => null);
        // BUG-CARD-05: ignora respostas não-JSON
        const d = r ? await r.json().catch(() => null) as {
          status?: string; base64?: string; phone?: string; profileName?: string; error?: string;
        } | null : null;

        if (d?.status === "qrcode" && d.base64) {
          clearInterval(pollIntervalRef.current!); pollIntervalRef.current = null;
          clearTimeout(proxyTimeoutRef.current!);  proxyTimeoutRef.current = null;
          setProxyOk(false); setQRBase64(d.base64); setQRState("qrcode");
        } else if (d?.status === "connected") {
          clearInterval(pollIntervalRef.current!); pollIntervalRef.current = null;
          clearTimeout(proxyTimeoutRef.current!);  proxyTimeoutRef.current = null;
          setProxyOk(false); setPhone(d.phone ?? null); setProfile(d.profileName ?? null); setQRState("connected");
        } else if (d?.status === "needs_proxy" || d?.error) {
          // BUG-CARD-04: proxy não funcionou — avisa o usuário para tentar outro
          clearInterval(pollIntervalRef.current!); pollIntervalRef.current = null;
          clearTimeout(proxyTimeoutRef.current!);  proxyTimeoutRef.current = null;
          setProxyOk(false);
          setProxyErr(d?.error ?? "Proxy não conseguiu conectar ao WhatsApp. Tente outro.");
        }
      }, 4000);

      // BUG-CARD-03: timeout de 45s — se QR não chegar, reseta banner e avisa
      proxyTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
        setProxyOk(false);
        setProxyErr("Tempo esgotado (45s). Proxy não respondeu — verifique as credenciais.");
      }, 45_000);
    } catch {
      setProxyErr("Erro de rede ao salvar proxy.");
    } finally {
      setProxySaving(false);
    }
  }

  // Polling: dispara fetchQR ao entrar em "idle" e mantém intervalo em "qrcode"
  useEffect(() => {
    if (qrState === "idle") {
      setQRState("loading");
      fetchQR();
      return;
    }
    // Não faz polling nos estados terminais
    if (qrState !== "qrcode") return;

    const id = setInterval(fetchQR, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [qrState, fetchQR]);

  // Countdown do QR — interval criado UMA vez por entrada em "qrcode", sem countdown nas deps
  useEffect(() => {
    if (qrState !== "qrcode") return;

    countdownRef.current = QR_TIMEOUT;
    setCountdown(QR_TIMEOUT);

    const id = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        // Força novo QR; o polling useEffect continua rodando
        fetchQR();
        countdownRef.current = QR_TIMEOUT;
        setCountdown(QR_TIMEOUT);
      }
    }, 1000);
    return () => clearInterval(id);
  // fetchQR é estável (useCallback sem deps), QR_TIMEOUT é constante — sem countdown nas deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrState]);

  async function handleDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/evolution/qrcode", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        setErrMsg(data?.error ?? "Erro ao desconectar. Tente novamente.");
        setQRState("error");
        return;
      }
      setPhone(null);
      setProfile(null);
      setQRBase64(null);
      // Reinicia o state machine via "idle" — o polling useEffect cuida do resto
      setQRState("idle");
    } catch {
      setErrMsg("Erro de rede ao desconectar.");
      setQRState("error");
    } finally {
      setDisconnecting(false);
    }
  }

  const isConnected = qrState === "connected";
  const needsProxy  = qrState === "needs_proxy";

  return (
    <div className={`rounded-2xl p-6 flex flex-col gap-4 border ${
      isConnected  ? "bg-green-50 border-green-300"
      : needsProxy ? "bg-amber-50 border-amber-300"
      : "bg-emerald-50 border-emerald-300"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <div>
            <h2 className={`text-sm font-bold ${isConnected ? "text-green-800" : needsProxy ? "text-amber-800" : "text-emerald-800"}`}>
              WhatsApp QR Code
            </h2>
            <p className={`text-xs ${isConnected ? "text-green-600" : needsProxy ? "text-amber-600" : "text-emerald-500"}`}>
              {isConnected ? "Conectado via QR Code" : needsProxy ? "Proxy necessário" : "Escaneie para conectar"}
            </p>
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${
          isConnected  ? "bg-green-100 text-green-700 border-green-300"
          : needsProxy ? "bg-amber-100 text-amber-700 border-amber-300"
          : "bg-emerald-100 text-emerald-700 border-emerald-300"
        }`}>
          {isConnected ? "✅ ONLINE" : needsProxy ? "⚙️ PROXY" : qrState === "loading" ? "⏳ AGUARDANDO" : "QR CODE"}
        </span>
      </div>

      {/* Conectado */}
      {isConnected && (
        <>
          <div className="bg-white border border-green-200 rounded-xl p-4 space-y-2">
            {phone   && <p className="text-xs text-gray-700"><span className="font-semibold">Número:</span> +{phone}</p>}
            {profile && <p className="text-xs text-gray-700"><span className="font-semibold">Perfil:</span> {profile}</p>}
            <p className="text-xs text-green-700 font-semibold">Recebendo mensagens automaticamente</p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs px-4 py-2 rounded-lg bg-white border border-red-300 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </button>
        </>
      )}

      {/* QR Code */}
      {qrState === "qrcode" && qrBase64 && (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-sm">
            <img
              src={qrBase64}
              alt="QR Code WhatsApp"
              className="w-48 h-48 object-contain"
            />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-emerald-700">Abra o WhatsApp → aparelhos conectados → escanear</p>
            <p className="text-xs text-emerald-500 mt-1">Expira em {countdown}s</p>
          </div>
          <button
            onClick={fetchQR}
            className="text-xs text-emerald-600 hover:text-emerald-800 underline"
          >
            Atualizar QR
          </button>
        </div>
      )}

      {/* Carregando */}
      {(qrState === "loading" || qrState === "idle") && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-emerald-600">Gerando QR Code...</p>
        </div>
      )}

      {/* Proxy necessário */}
      {needsProxy && (
        <div className="space-y-3">
          {/* Banner de sucesso após salvar — polling ativo em background */}
          {proxyOk && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
              <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-green-700">Proxy salvo! Aguardando QR code...</p>
                <p className="text-xs text-green-600">Baileys conectando via proxy — pode levar até 30s</p>
              </div>
            </div>
          )}
          {!proxyOk && (
            <div className="bg-amber-100 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800">Por que precisa de proxy?</p>
              <p className="text-xs text-amber-700 mt-1">
                O WhatsApp bloqueia conexões diretas de servidores em nuvem (Railway, AWS, etc.).
                Um proxy residencial redireciona a conexão por um IP doméstico.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-amber-800 block mb-1">Host</label>
                <input
                  value={proxyHost}
                  onChange={e => setProxyHost(e.target.value)}
                  placeholder="proxy.exemplo.com"
                  className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="w-20">
                <label className="text-xs font-semibold text-amber-800 block mb-1">Porta</label>
                <input
                  value={proxyPort}
                  onChange={e => setProxyPort(e.target.value.replace(/\D/g, ""))}
                  placeholder="8080"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="w-24">
                <label className="text-xs font-semibold text-amber-800 block mb-1">Protocolo</label>
                <select
                  value={proxyProtocol}
                  onChange={e => setProxyProtocol(e.target.value as "http" | "socks5")}
                  className="w-full bg-white border border-amber-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="http">HTTP</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-amber-800 block mb-1">Usuário (opcional)</label>
                <input
                  value={proxyUser}
                  onChange={e => setProxyUser(e.target.value)}
                  placeholder="user"
                  className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-amber-800 block mb-1">Senha (opcional)</label>
                <input
                  value={proxyPass}
                  onChange={e => setProxyPass(e.target.value)}
                  type="password"
                  placeholder="••••••"
                  className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {proxyErr && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ⚠️ {proxyErr}
            </p>
          )}

          <button
            onClick={handleSaveProxy}
            disabled={proxySaving || !proxyHost.trim() || !proxyPort.trim()}
            className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {proxySaving ? "Configurando..." : "Salvar Proxy e Gerar QR"}
          </button>

          <p className="text-xs text-amber-600 text-center">
            Sugestão: IPRoyal, Smartproxy ou Bright Data (planos a partir de $2/GB)
          </p>
        </div>
      )}

      {/* Erro */}
      {qrState === "error" && (
        <div className="space-y-3">
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠️ {errMsg ?? "Erro ao conectar"}
          </p>
          <button
            onClick={() => { setQRState("loading"); setErrMsg(null); fetchQR(); }}
            className="w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Card Instagram ───────────────────────────────────────────────────────────
function InstagramCard() {
  return (
    <div className="bg-gray-100 border border-gray-300 rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📸</span>
          <div>
            <h2 className="text-sm font-bold text-gray-500">Instagram DM</h2>
            <p className="text-xs text-gray-400">Respostas automáticas via Direct</p>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full font-semibold bg-gray-200 text-gray-400 border border-gray-300">
          EM BREVE
        </span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <p className="text-xs text-gray-400">• Resposta automática de DMs</p>
        <p className="text-xs text-gray-400">• Captura de leads via Instagram</p>
        <p className="text-xs text-gray-400">• Integração com IA Groq</p>
      </div>
      <button
        disabled
        className="w-full py-2.5 rounded-xl bg-gray-200 text-gray-400 text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2"
      >
        🔒 Em Breve
      </button>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  return (
    <main className="min-h-screen bg-[#0d1117] p-6">
      <header className="flex items-center justify-between mb-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-white">Integrações</h1>
          <p className="text-xs text-gray-500">Conecte seus canais de atendimento</p>
        </div>
        <a href="/" className="text-xs text-blue-400 hover:underline">← Voltar ao CRM</a>
      </header>

      <div
        className="max-w-4xl mx-auto"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}
      >
        <WhatsAppQRCard />
        <WhatsAppCard />
        <InstagramCard />
      </div>
    </main>
  );
}
