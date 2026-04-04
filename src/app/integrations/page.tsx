"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Card WhatsApp ────────────────────────────────────────────────────────────
function WhatsAppCard() {
  const [token,         setToken]         = useState("");
  const [saving,        setSaving]        = useState(false);
  const [connected,     setConnected]     = useState(false);
  const [phone,         setPhone]         = useState<string | null>(null);
  const [bizName,       setBizName]       = useState<string | null>(null);
  const [daysLeft,      setDaysLeft]      = useState<number | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async (uid: string) => {
    try {
      const res  = await fetch(`/api/integrations?userId=${uid}`);
      const data = await res.json().catch(() => null);
      const wa   = data?.whatsapp;
      if (wa?.active) {
        setConnected(true);
        setPhone(wa.phone       ?? null);
        setDaysLeft(wa.days_left ?? null);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    const uid = localStorage.getItem("crm_userId");
    if (uid) loadStatus(uid);
  }, [loadStatus]);

  async function handleSave() {
    if (!token.trim()) { setError("Cole o token antes de salvar."); return; }
    setError(null);
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

      if (!res.ok) { setError(data?.error ?? "Erro ao salvar."); return; }

      if (data?.userId) localStorage.setItem("crm_userId", data.userId);
      setConnected(true);
      setPhone(data?.displayPhone  ?? null);
      setBizName(data?.businessName ?? null);
      setToken("");
    } catch {
      setError("Erro de rede. Verifique sua conexão.");
    } finally {
      setSaving(false);
    }
  }

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

  // ── Conectado ────────────────────────────────────────────────────────────────
  if (connected && !tokenExpired) {
    return (
      <div className="bg-green-50 border border-green-300 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <div>
              <h2 className="text-sm font-bold text-green-800">WhatsApp Meta API</h2>
              <p className="text-xs text-green-600">Token permanente ativo</p>
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            tokenWarning
              ? "bg-yellow-100 text-yellow-700 border border-yellow-300"
              : "bg-green-100 text-green-700 border border-green-300"
          }`}>
            {tokenWarning ? `⚠️ Expira em ${daysLeft}d` : "✅ ATIVO"}
          </span>
        </div>

        <div className="bg-white border border-green-200 rounded-xl p-4 space-y-2">
          {phone   && <p className="text-xs text-green-800"><span className="font-semibold">Número:</span> {phone}</p>}
          {bizName && <p className="text-xs text-green-800"><span className="font-semibold">Empresa:</span> {bizName}</p>}
          {daysLeft !== null && (
            <p className="text-xs text-green-700">
              <span className="font-semibold">Token válido por:</span> {daysLeft} dia(s)
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs px-4 py-2 rounded-lg bg-white border border-red-300 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </button>
          <button
            onClick={() => setConnected(false)}
            className="text-xs px-4 py-2 rounded-lg bg-white border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
          >
            Atualizar Token
          </button>
        </div>
      </div>
    );
  }

  // ── Desconectado / Expirado ───────────────────────────────────────────────────
  return (
    <div className="bg-blue-50 border border-blue-300 rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <h2 className="text-sm font-bold text-blue-800">WhatsApp Meta API</h2>
            <p className="text-xs text-blue-500">
              {tokenExpired ? "Token expirado — cole um novo" : "Cole seu Permanent Access Token"}
            </p>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full font-semibold bg-blue-100 text-blue-700 border border-blue-300">
          {tokenExpired ? "EXPIRADO" : "DESCONECTADO"}
        </span>
      </div>

      {/* Guia 3 passos */}
      <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Como obter seu token</p>
        {[
          { n: 1, title: "Acesse Meta for Developers", desc: <>Vá em <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">developers.facebook.com/tools/explorer</a></> },
          { n: 2, title: "Selecione seu App e gere o Token", desc: <>Adicione a permissão <code className="bg-blue-50 px-1 rounded text-blue-700">whatsapp_business_messaging</code> e clique em <strong>Generate Access Token</strong></> },
          { n: 3, title: "Cole o token abaixo e salve", desc: <>O token será validado automaticamente antes de ser salvo.</> },
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

      {/* Textarea */}
      <div>
        <label className="text-xs font-semibold text-blue-700 mb-1.5 block">Permanent Access Token</label>
        <textarea
          value={token}
          onChange={e => { setToken(e.target.value); setError(null); }}
          placeholder="EAAGm0PX4ZApsBO..."
          rows={3}
          className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2.5 text-xs font-mono text-blue-900 placeholder-blue-300 resize-none focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          ⚠️ {error}
        </p>
      )}

      <button
        onClick={handleSave}
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
        ) : "✅ Conectar WhatsApp"}
      </button>
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
        <WhatsAppCard />
        <InstagramCard />
      </div>
    </main>
  );
}
