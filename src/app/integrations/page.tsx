"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
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
  type QRState = "idle" | "loading" | "qrcode" | "connected" | "error";
  const [qrState,    setQRState]    = useState<QRState>("idle");
  const [qrBase64,   setQRBase64]   = useState<string | null>(null);
  const [phone,      setPhone]      = useState<string | null>(null);
  const [profile,    setProfile]    = useState<string | null>(null);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);
  const [countdown,  setCountdown]  = useState(0);

  const POLL_INTERVAL = 4000; // 4 segundos
  const QR_TIMEOUT    = 60;   // QR expira em ~60s

  const fetchQR = useCallback(async () => {
    try {
      const res  = await fetch("/api/evolution/qrcode");
      const data = await res.json() as {
        status?: string; base64?: string; count?: number;
        phone?: string; profileName?: string; error?: string;
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
        setCountdown(QR_TIMEOUT);
        return;
      }

      // Ainda conectando — tenta novamente
      setQRState("loading");
    } catch {
      setErrMsg("Sem conexão com o servidor.");
      setQRState("error");
    }
  }, []);

  // Inicia polling automático quando card é aberto
  useEffect(() => {
    if (qrState !== "idle" && qrState !== "qrcode" && qrState !== "connected") return;
    if (qrState === "idle") { fetchQR(); setQRState("loading"); return; }
    if (qrState === "connected") return;

    const id = setInterval(fetchQR, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [qrState, fetchQR]);

  // Countdown do QR
  useEffect(() => {
    if (qrState !== "qrcode" || countdown <= 0) return;
    const id = setInterval(() => setCountdown(c => {
      if (c <= 1) { fetchQR(); return QR_TIMEOUT; }
      return c - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [qrState, countdown, fetchQR]);

  async function handleDisconnect() {
    await fetch("/api/evolution/qrcode", { method: "DELETE" });
    setQRState("loading");
    setPhone(null);
    setProfile(null);
    setQRBase64(null);
    fetchQR();
  }

  const isConnected = qrState === "connected";

  return (
    <div className={`rounded-2xl p-6 flex flex-col gap-4 border ${
      isConnected ? "bg-green-50 border-green-300" : "bg-emerald-50 border-emerald-300"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <div>
            <h2 className={`text-sm font-bold ${isConnected ? "text-green-800" : "text-emerald-800"}`}>
              WhatsApp QR Code
            </h2>
            <p className={`text-xs ${isConnected ? "text-green-600" : "text-emerald-500"}`}>
              {isConnected ? "Conectado via QR Code" : "Escaneie para conectar"}
            </p>
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${
          isConnected
            ? "bg-green-100 text-green-700 border-green-300"
            : "bg-emerald-100 text-emerald-700 border-emerald-300"
        }`}>
          {isConnected ? "✅ ONLINE" : qrState === "loading" ? "⏳ AGUARDANDO" : "QR CODE"}
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
            className="text-xs px-4 py-2 rounded-lg bg-white border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
          >
            Desconectar
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
