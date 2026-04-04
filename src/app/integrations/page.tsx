"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Integration = {
  active:        boolean;
  status:        string;
  webhook?:      string;
  verify_token?: string;
  phone?:        string;
  days_left?:    number | null;
  url?:          string;
  instance?:     string;
  model?:        string;
  project?:      string;
  configured?:   boolean;
};

type IntegrationsData = Record<string, Integration>;

const LABELS: Record<string, { name: string; icon: string }> = {
  whatsapp:           { name: "WhatsApp Meta API",  icon: "💬" },
  whatsapp_evolution: { name: "WhatsApp Evolution", icon: "📱" },
  instagram:          { name: "Instagram DM",       icon: "📸" },
  groq_ai:            { name: "IA Groq",            icon: "🤖" },
  supabase:           { name: "Supabase (Banco)",   icon: "🗄️" },
  oauth:              { name: "OAuth Meta",         icon: "🔐" },
};

// ─── Componente: Card WhatsApp Manual ────────────────────────────────────────
function WhatsAppCard({ userId, onConnect }: { userId: string | null; onConnect: (uid: string, phone: string) => void }) {
  const [token,      setToken]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [connected,  setConnected]  = useState(false);
  const [phone,      setPhone]      = useState<string | null>(null);
  const [bizName,    setBizName]    = useState<string | null>(null);
  const [daysLeft,   setDaysLeft]   = useState<number | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Carrega status inicial do Supabase se userId existir
  const loadStatus = useCallback(async (uid: string) => {
    try {
      const res  = await fetch(`/api/integrations?userId=${uid}`);
      const data = await res.json();
      const wa   = data.whatsapp as Integration | undefined;
      if (wa?.active) {
        setConnected(true);
        setPhone(wa.phone ?? null);
        setDaysLeft(wa.days_left ?? null);
      } else {
        setConnected(false);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    const storedUid = userId || (typeof window !== "undefined" ? localStorage.getItem("crm_userId") : null);
    if (storedUid) loadStatus(storedUid);
  }, [userId, loadStatus]);

  // ── Salva token ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!token.trim()) {
      setError("Cole o token antes de salvar.");
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const storedUid = typeof window !== "undefined" ? localStorage.getItem("crm_userId") : null;
      const body: Record<string, string> = { token: token.trim() };
      if (storedUid) body.userId = storedUid;

      const res  = await fetch("/api/integrations/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao salvar token.");
        return;
      }

      // Persiste userId no browser
      if (data.userId && typeof window !== "undefined") {
        localStorage.setItem("crm_userId", data.userId);
      }

      setConnected(true);
      setPhone(data.displayPhone ?? null);
      setBizName(data.businessName ?? null);
      setToken("");
      onConnect(data.userId, data.displayPhone ?? "");
    } catch {
      setError("Erro de rede. Verifique sua conexão.");
    } finally {
      setSaving(false);
    }
  }

  // ── Desconecta ───────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    const uid = typeof window !== "undefined" ? localStorage.getItem("crm_userId") : null;
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

  // ── Token expirado ───────────────────────────────────────────────────────────
  const tokenWarning = daysLeft !== null && daysLeft < 7;
  const tokenExpired = daysLeft !== null && daysLeft <= 0;

  return (
    <div className={`bg-[#1a1d27] border rounded-xl p-5 col-span-1 md:col-span-2 ${
      connected
        ? tokenExpired  ? "border-red-500/50"
        : tokenWarning  ? "border-yellow-500/50"
        : "border-green-500/40"
        : "border-blue-500/30"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <h2 className="text-sm font-bold text-white">WhatsApp Meta API</h2>
            <p className="text-xs text-gray-500">
              {connected ? "Token permanente ativo" : "Cole seu Permanent Access Token"}
            </p>
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
          connected
            ? tokenExpired  ? "bg-red-500/20 text-red-400"
            : tokenWarning  ? "bg-yellow-500/20 text-yellow-400"
            : "bg-green-500/20 text-green-400"
            : "bg-blue-500/20 text-blue-400"
        }`}>
          {connected
            ? tokenExpired  ? "EXPIRADO"
            : tokenWarning  ? `EXPIRA EM ${daysLeft}d`
            : "ATIVO"
            : "DESCONECTADO"}
        </span>
      </div>

      {/* ── Estado Conectado ─────────────────────────────────────────────────── */}
      {connected ? (
        <div className="space-y-3">
          <div className="bg-[#252938] rounded-lg p-3 space-y-2">
            {phone    && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Número:</span> <span className="text-xs text-green-400 font-mono">{phone}</span></div>}
            {bizName  && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Empresa:</span> <span className="text-xs text-gray-300">{bizName}</span></div>}
            {daysLeft !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Token válido por:</span>
                <span className={`text-xs font-mono ${tokenExpired ? "text-red-400" : tokenWarning ? "text-yellow-400" : "text-gray-300"}`}>
                  {tokenExpired ? "⚠️ Expirado" : `${daysLeft} dia(s)`}
                </span>
              </div>
            )}
          </div>

          {tokenExpired && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              ⚠️ Token expirado. Cole um novo token abaixo para reconectar.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {disconnecting ? "Desconectando..." : "Desconectar"}
            </button>
            <button
              onClick={() => setConnected(false)}
              className="text-xs px-3 py-2 rounded-lg bg-[#2d3148] text-gray-400 hover:bg-[#363b5a] transition-colors"
            >
              Atualizar Token
            </button>
          </div>
        </div>
      ) : (
        /* ── Estado Desconectado ──────────────────────────────────────────────── */
        <div className="space-y-4">

          {/* Guia 3 passos */}
          <div className="bg-[#0d1117] border border-[#2d3148] rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Como obter seu token
            </p>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">1</span>
                <div>
                  <p className="text-xs text-gray-300 font-medium">Acesse Meta for Developers</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Vá em{" "}
                    <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      developers.facebook.com/tools/explorer
                    </a>
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">2</span>
                <div>
                  <p className="text-xs text-gray-300 font-medium">Selecione seu App e gere o Token</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Escolha sua conta WhatsApp Business, adicione as permissões <code className="bg-[#1a1d27] px-1 rounded">whatsapp_business_messaging</code> e clique em <strong className="text-gray-400">Generate Access Token</strong>
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">3</span>
                <div>
                  <p className="text-xs text-gray-300 font-medium">Cole o token abaixo e salve</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    O token será validado automaticamente na Meta API antes de ser salvo.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          {/* Campo token */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block font-medium">
              Permanent Access Token
            </label>
            <textarea
              value={token}
              onChange={e => { setToken(e.target.value); setError(null); }}
              placeholder="EAAGm0PX4ZApsBO..."
              rows={3}
              className="w-full bg-[#0d1117] border border-[#2d3148] rounded-lg px-3 py-2.5 text-xs font-mono text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Erro */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 flex items-start gap-2">
              <span>⚠️</span> {error}
            </p>
          )}

          {/* Botão salvar */}
          <button
            onClick={handleSave}
            disabled={saving || !token.trim()}
            className="w-full py-2.5 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/>
                </svg>
                Validando token na Meta...
              </>
            ) : (
              "✅ Conectar WhatsApp"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [data,    setData]    = useState<IntegrationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string | null>(null);

  // Carrega userId do localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUserId(localStorage.getItem("crm_userId"));
    }
  }, []);

  // Busca status das integrações
  const fetchStatus = useCallback(async (uid?: string) => {
    const qs  = uid || userId ? `?userId=${uid ?? userId}` : "";
    const res = await fetch(`/api/integrations${qs}`).catch(() => null);
    if (!res) { setLoading(false); return; }
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Callback quando WhatsApp conecta
  function handleWaConnect(uid: string, phone: string) {
    if (typeof window !== "undefined") localStorage.setItem("crm_userId", uid);
    setUserId(uid);
    fetchStatus(uid);
    void phone;
  }

  // Chaves a exibir no grid (exclui whatsapp — tem card dedicado)
  const otherKeys = data ? Object.keys(data).filter(k => k !== "whatsapp") : [];

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Integrações</h1>
          <p className="text-xs text-gray-500">Status de todos os canais conectados</p>
        </div>
        <a href="/" className="text-xs text-blue-400 hover:underline">← Voltar ao CRM</a>
      </header>

      {loading && (
        <div className="text-gray-400 text-sm animate-pulse mb-4">Verificando integrações...</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card WhatsApp dedicado — sempre no topo */}
        <WhatsAppCard userId={userId} onConnect={handleWaConnect} />

        {/* Cards das demais integrações */}
        {data && otherKeys.map(key => {
          const val = data[key];
          const label = LABELS[key];
          if (!label) return null;

          return (
            <div
              key={key}
              className={`bg-[#1a1d27] border rounded-xl p-4 ${val.active || val.configured ? "border-green-500/30" : "border-red-500/30"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{label.icon}</span>
                  <span className="text-sm font-semibold text-white">{label.name}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${val.active || val.configured ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {val.active || val.configured ? "ATIVO" : "INATIVO"}
                </span>
              </div>

              <p className="text-xs text-gray-400 mb-3">{val.status}</p>

              <div className="space-y-1 text-xs text-gray-500">
                {val.webhook   && <div><span className="text-gray-600">Webhook:</span> <span className="text-gray-400 font-mono">{val.webhook}</span></div>}
                {val.verify_token && <div><span className="text-gray-600">Token:</span> <span className="text-gray-400 font-mono">{val.verify_token}</span></div>}
                {val.phone     && <div><span className="text-gray-600">Número:</span> <span className="text-gray-400">{val.phone}</span></div>}
                {val.instance  && <div><span className="text-gray-600">Instância:</span> <span className="text-gray-400">{val.instance}</span></div>}
                {val.url && val.url !== "pendente" && <div><span className="text-gray-600">URL:</span> <span className="text-gray-400 font-mono">{val.url}</span></div>}
                {val.model     && <div><span className="text-gray-600">Modelo:</span> <span className="text-gray-400">{val.model}</span></div>}
                {val.project   && <div><span className="text-gray-600">Projeto:</span> <span className="text-gray-400 font-mono">{val.project}</span></div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* URLs dos Webhooks */}
      <div className="mt-6 bg-[#1a1d27] border border-[#2d3148] rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">URLs dos Webhooks</p>
        {[
          { label: "WhatsApp Meta",  path: "/api/webhook/whatsapp"  },
          { label: "Evolution API",  path: "/api/webhook/evolution" },
          { label: "Instagram DM",   path: "/api/webhook/instagram" },
        ].map(({ label, path }) => (
          <div key={path} className="flex items-center justify-between py-2 border-b border-[#2d3148] last:border-0 gap-4">
            <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
            <code className="text-xs text-blue-400 bg-[#252938] px-2 py-1 rounded truncate">
              {typeof window !== "undefined" ? window.location.origin : "https://crm-7business-production.up.railway.app"}{path}
            </code>
          </div>
        ))}
      </div>
    </main>
  );
}
