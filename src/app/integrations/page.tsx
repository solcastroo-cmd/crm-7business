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
  const [disconnecting, setDisconnecting] = useState(false);
  const [showManual,    setShowManual]    = useState(false);

  // ── token manual (fallback) ────────────────────────────────────────────────
  const [token,  setToken]  = useState("");
  const [saving, setSaving] = useState(false);
  const [tokenErr, setTokenErr] = useState<string | null>(null);

  // ── carrega status do Supabase ─────────────────────────────────────────────
  const loadStatus = useCallback(async (uid: string) => {
    try {
      const res  = await fetch(`/api/integrations?userId=${uid}`);
      const data = await res.json().catch(() => null);
      const wa   = data?.whatsapp;
      if (wa?.active) {
        setConnected(true);
        setPhone(wa.phone       ?? null);
        setDaysLeft(wa.days_left ?? null);
      } else {
        setConnected(false);
      }
    } catch { /* silencioso */ }
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
      await fetch(`/api/integrations/whatsapp?userId=${uid}`, { method: "DELETE" });
      setConnected(false);
      setPhone(null);
      setBizName(null);
      setDaysLeft(null);
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
        <WhatsAppCard />
        <InstagramCard />
      </div>
    </main>
  );
}
