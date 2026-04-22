"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useUserId } from "@/hooks/useUserId";

const inp = "w-full px-3 py-2 rounded-xl text-sm border focus:outline-none";
const inpStyle = { background: "#111", border: "1px solid #3a3a3a", color: "#fff" };

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: "#1a1a1a", border: `1px solid ${accent ? "#dc2626" : "#2e2e2e"}` }}>
      {children}
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full font-bold"
      style={{ background: active ? "#14532d" : "#1f2937", color: active ? "#4ade80" : "#6b7280", border: `1px solid ${active ? "#166534" : "#374151"}` }}>
      {label ?? (active ? "✓ CONECTADO" : "DESCONECTADO")}
    </span>
  );
}

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2">{msg}</p>;
}

function WebhookBox({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div className="rounded-xl px-3 py-2 text-xs font-mono" style={{ background: "#111", border: "1px solid #2e2e2e" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-500 font-sans font-semibold">{label}:</span>
        <button onClick={copy} className="text-xs text-blue-400 hover:text-blue-300 font-sans">
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <span className="text-green-400 break-all">{url}</span>
    </div>
  );
}

// ─── Z-API ────────────────────────────────────────────────────────────────────
function ZApiCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/zapi?userId=${uid}`);
      if (!res.ok) return;
      const d = await res.json();
      if (d.active) { setConnected(true); setPhone(d.phone ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleSave() {
    if (!instance.trim() || !token.trim() || !clientToken.trim()) {
      setErr("Preencha Instance ID, Token e Client-Token."); return;
    }
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/zapi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, instance: instance.trim(), token: token.trim(), clientToken: clientToken.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao conectar."); return; }
      setConnected(true); setPhone(d.phone ?? null);
      setInstance(""); setToken(""); setClientToken("");
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/zapi?userId=${userId}`, { method: "DELETE" });
      setConnected(false); setPhone(null);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#14532d" }}>📱</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Z-API WhatsApp</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#14532d", color: "#4ade80" }}>RECOMENDADO</span>
            </div>
            <p className="text-xs text-gray-500">Receba leads via WhatsApp automaticamente</p>
          </div>
        </div>
        <StatusBadge active={connected} />
      </div>
      <Err msg={err} />
      {connected ? (
        <div className="space-y-3">
          {phone && <p className="text-xs text-gray-400">Número: <span className="font-bold text-white">{phone}</span></p>}
          <WebhookBox label="Webhook URL" url={typeof window !== "undefined" ? `${window.location.origin}/api/webhook/zapi` : "/api/webhook/zapi"} />
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "#7f1d1d" }}>
            {busy ? "Desconectando..." : "Desconectar Z-API"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={instance} onChange={e => setInstance(e.target.value)} placeholder="Instance ID (ex: 3ABC12)" className={inp} style={inpStyle} />
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="Token da instância" className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
          <input value={clientToken} onChange={e => setClientToken(e.target.value)} placeholder="Client-Token (Security → Client-Token)" className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
          <button onClick={handleSave} disabled={saving || !instance.trim() || !token.trim() || !clientToken.trim()}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#16a34a" }}>
            {saving ? "Conectando..." : "Conectar Z-API"}
          </button>
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#111", border: "1px dashed #3a3a3a" }}>
            <p className="font-semibold text-gray-300">Como obter as credenciais:</p>
            <p>1. Acesse o painel Z-API e abra sua instância</p>
            <p>2. <strong className="text-gray-300">Instance ID</strong> e <strong className="text-gray-300">Token</strong> estão na aba <code className="text-green-400">Credenciais</code></p>
            <p>3. <strong className="text-gray-300">Client-Token</strong> está em <code className="text-green-400">Security → Client-Token</code></p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Instagram ────────────────────────────────────────────────────────────────
function InstagramCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [pageId, setPageId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/instagram?userId=${uid}`);
      if (!res.ok) return;
      const d = await res.json();
      if (d.active) { setConnected(true); setUsername(d.username ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleSave() {
    if (!token.trim()) { setErr("Cole o Page Access Token."); return; }
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/instagram", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, token: token.trim(), pageId: pageId.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao conectar."); return; }
      setConnected(true); setUsername(d.username ?? null); setToken(""); setPageId("");
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/instagram?userId=${userId}`, { method: "DELETE" });
      setConnected(false); setUsername(null);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#500724" }}>📸</div>
          <div>
            <h2 className="text-sm font-bold text-white">Instagram DM</h2>
            <p className="text-xs text-gray-500">Receba mensagens diretas como leads</p>
          </div>
        </div>
        <StatusBadge active={connected} />
      </div>
      <Err msg={err} />
      {connected ? (
        <div className="space-y-3">
          {username && <p className="text-xs text-gray-400">Conta: <span className="font-bold text-white">@{username}</span></p>}
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#7f1d1d" }}>
            {busy ? "Desconectando..." : "Desconectar Instagram"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="Page ID (opcional)" className={inp} style={inpStyle} />
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="Page Access Token" className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
          <button onClick={handleSave} disabled={saving || !token.trim()}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#db2777" }}>
            {saving ? "Conectando..." : "Conectar Instagram"}
          </button>
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#111", border: "1px dashed #3a3a3a" }}>
            <p className="font-semibold text-gray-300">Como obter o token:</p>
            <p>1. Acesse <code className="text-pink-400">developers.facebook.com</code></p>
            <p>2. Crie um App → Produto Instagram</p>
            <p>3. Gere o Page Access Token com <code className="text-pink-400">instagram_manage_messages</code></p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── WhatsApp Meta API ────────────────────────────────────────────────────────
function OAuthResultHandler({ onResult }: { onResult: (uid: string | null, err: string | null) => void }) {
  const sp = useSearchParams();
  useEffect(() => {
    const err = sp.get("error");
    const uid = sp.get("userId");
    if (err || uid) onResult(uid, err);
  }, [sp, onResult]);
  return null;
}

function WhatsAppMetaCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [bizName, setBizName] = useState<string | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations?userId=${uid}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const wa = data?.whatsapp;
      if (wa?.active) {
        setConnected(true); setPhone(wa.phone ?? null);
        setDaysLeft(wa.days_left ?? null); setBizName(wa.business_name ?? null);
      } else { setConnected(false); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (userId) loadStatus(userId);
  }, [userId, loadStatus]);

  function handleOAuthResult(uid: string | null, errStr: string | null) {
    if (errStr) { setOauthError(errStr); return; }
    if (uid) loadStatus(uid);
  }

  async function handleSaveManual() {
    if (!token.trim()) { setErr("Cole o token antes de salvar."); return; }
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const body: Record<string, string> = { token: token.trim(), userId };
      const res = await fetch("/api/integrations/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setErr(data?.error ?? "Erro ao salvar."); return; }
      setPhone(data?.displayPhone ?? null); setBizName(data?.businessName ?? null);
      setConnected(true); setToken(""); setShowManual(false);
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/whatsapp?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => null); setErr(d?.error ?? "Erro."); return; }
      setConnected(false); setPhone(null); setBizName(null); setDaysLeft(null);
    } catch { setErr("Erro de rede."); }
    finally { setBusy(false); }
  }

  const tokenWarning = daysLeft !== null && daysLeft < 7;
  const tokenExpired = daysLeft !== null && daysLeft <= 0;

  return (
    <>
      <Suspense fallback={null}><OAuthResultHandler onResult={handleOAuthResult} /></Suspense>
      <Card accent={tokenExpired}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#1e3a5f" }}>🔷</div>
            <div>
              <h2 className="text-sm font-bold text-white">WhatsApp Meta API</h2>
              <p className="text-xs text-gray-500">Meta Business API (Cloud)</p>
            </div>
          </div>
          <StatusBadge active={connected && !tokenExpired}
            label={connected ? (tokenExpired ? "EXPIRADO" : tokenWarning ? `⚠ ${daysLeft}d` : daysLeft === null ? "✓ PERMANENTE" : `✓ ${daysLeft}d`) : "DESCONECTADO"} />
        </div>
        <Err msg={oauthError ?? err} />
        {connected ? (
          <div className="space-y-3">
            {bizName && <p className="text-sm font-semibold text-white">{bizName}</p>}
            {phone && <p className="text-xs text-gray-400">Número: {phone}</p>}
            {tokenWarning && !tokenExpired && (
              <p className="text-xs text-yellow-400 bg-yellow-950 border border-yellow-800 rounded-xl px-3 py-2">⚠ Token expira em {daysLeft} dia(s). Reconecte para continuar.</p>
            )}
            {tokenExpired && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2">Token expirado. Reconecte agora.</p>
            )}
            <button onClick={handleDisconnect} disabled={busy}
              className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#7f1d1d" }}>
              {busy ? "Desconectando..." : "Desconectar Meta API"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Cole um token permanente do Meta Business para receber mensagens como leads.</p>
            <button onClick={() => setShowManual(v => !v)} className="text-xs text-blue-400 underline underline-offset-2">
              {showManual ? "Ocultar campo de token" : "Tenho um token — colar manualmente"}
            </button>
            {showManual && (
              <div className="space-y-2">
                <input value={token} onChange={e => setToken(e.target.value)} placeholder="EAAxxxxx..." className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
                <button onClick={handleSaveManual} disabled={saving || !token.trim()}
                  className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#1d4ed8" }}>
                  {saving ? "Salvando..." : "Salvar Token"}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── OLX ─────────────────────────────────────────────────────────────────────
function OlxCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/olx?userId=${uid}`);
      const d = await res.json();
      if (d.active) { setConnected(true); setToken(d.token ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleActivate() {
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/olx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao ativar."); return; }
      setConnected(true); setToken(d.token ?? null);
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/olx?userId=${userId}`, { method: "DELETE" });
      setConnected(false); setToken(null);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const webhookUrl = typeof window !== "undefined" && token
    ? `${window.location.origin}/api/webhook/olx?token=${token}`
    : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm" style={{ background: "#f97316", color: "#fff" }}>OLX</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">OLX Pro</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#431407", color: "#fb923c" }}>PORTAL</span>
            </div>
            <p className="text-xs text-gray-500">Capture leads de anúncios OLX automaticamente</p>
          </div>
        </div>
        <StatusBadge active={connected} />
      </div>
      <Err msg={err} />
      {connected && webhookUrl ? (
        <div className="space-y-3">
          <WebhookBox label="URL do Webhook (configure no painel OLX Pro)" url={webhookUrl} />
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#111", border: "1px dashed #3a3a3a" }}>
            <p className="font-semibold text-gray-300">Como configurar:</p>
            <p>1. Acesse <code className="text-orange-400">olxpro.com.br</code> → sua conta de anunciante</p>
            <p>2. Vá em <code className="text-orange-400">Configurações → Integração / Webhook de Leads</code></p>
            <p>3. Cole a URL acima como destino dos leads</p>
            <p>4. Salve — leads chegam instantaneamente ao CRM</p>
          </div>
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#7f1d1d" }}>
            {busy ? "Desativando..." : "Desativar OLX"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Ao ativar, uma URL exclusiva será gerada para configurar no painel OLX Pro como destino dos leads.
          </p>
          <button onClick={handleActivate} disabled={saving || !userId}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#ea580c" }}>
            {saving ? "Ativando..." : "Ativar Integração OLX"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── Webmotors ────────────────────────────────────────────────────────────────
function WebmotorsCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/webmotors?userId=${uid}`);
      const d = await res.json();
      if (d.active) { setConnected(true); setToken(d.token ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleActivate() {
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/webmotors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao ativar."); return; }
      setConnected(true); setToken(d.token ?? null);
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/webmotors?userId=${userId}`, { method: "DELETE" });
      setConnected(false); setToken(null);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const webhookUrl = typeof window !== "undefined" && token
    ? `${window.location.origin}/api/webhook/webmotors?token=${token}`
    : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs" style={{ background: "#dc2626", color: "#fff" }}>WM</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Webmotors</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#450a0a", color: "#f87171" }}>PORTAL</span>
            </div>
            <p className="text-xs text-gray-500">Receba leads do Webmotors no CRM</p>
          </div>
        </div>
        <StatusBadge active={connected} />
      </div>
      <Err msg={err} />
      {connected && webhookUrl ? (
        <div className="space-y-3">
          <WebhookBox label="URL do Webhook (configure no painel Webmotors)" url={webhookUrl} />
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#111", border: "1px dashed #3a3a3a" }}>
            <p className="font-semibold text-gray-300">Como configurar:</p>
            <p>1. Acesse <code className="text-red-400">webmotors.com.br</code> → Painel do Anunciante</p>
            <p>2. Vá em <code className="text-red-400">Configurações → Integração CRM</code></p>
            <p>3. Cole a URL acima como Webhook de Leads</p>
            <p>4. Salve — leads chegam instantaneamente ao CRM</p>
          </div>
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#7f1d1d" }}>
            {busy ? "Desativando..." : "Desativar Webmotors"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Ao ativar, uma URL exclusiva será gerada para configurar no painel Webmotors como CRM de destino.
          </p>
          <button onClick={handleActivate} disabled={saving || !userId}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#dc2626" }}>
            {saving ? "Ativando..." : "Ativar Integração Webmotors"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── iCarros ─────────────────────────────────────────────────────────────────
function ICarrosCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/icarros?userId=${uid}`);
      const d = await res.json();
      if (d.active) { setConnected(true); setToken(d.token ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleActivate() {
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/icarros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao ativar."); return; }
      setConnected(true); setToken(d.token ?? null);
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/icarros?userId=${userId}`, { method: "DELETE" });
      setConnected(false); setToken(null);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const webhookUrl = typeof window !== "undefined" && token
    ? `${window.location.origin}/api/webhook/icarros?token=${token}`
    : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs" style={{ background: "#2563eb", color: "#fff" }}>iC</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">iCarros</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#1e1b4b", color: "#818cf8" }}>PORTAL</span>
            </div>
            <p className="text-xs text-gray-500">Receba leads do iCarros no CRM</p>
          </div>
        </div>
        <StatusBadge active={connected} />
      </div>
      <Err msg={err} />
      {connected && webhookUrl ? (
        <div className="space-y-3">
          <WebhookBox label="URL do Webhook (configure no painel iCarros)" url={webhookUrl} />
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#111", border: "1px dashed #3a3a3a" }}>
            <p className="font-semibold text-gray-300">Como configurar:</p>
            <p>1. Acesse <code className="text-blue-400">icarros.com.br</code> → Painel do Anunciante</p>
            <p>2. Vá em <code className="text-blue-400">Configurações → Integração / Webhook</code></p>
            <p>3. Cole a URL acima como destino dos leads</p>
            <p>4. Salve — leads chegam instantaneamente ao CRM</p>
          </div>
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#7f1d1d" }}>
            {busy ? "Desativando..." : "Desativar iCarros"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Ao ativar, uma URL exclusiva será gerada para configurar no painel iCarros como CRM de destino.
          </p>
          <button onClick={handleActivate} disabled={saving || !userId}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#2563eb" }}>
            {saving ? "Ativando..." : "Ativar Integração iCarros"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── Facebook Meta Leads ──────────────────────────────────────────────────────
function FacebookLeadsCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pageName, setPageName] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/facebook-leads?userId=${uid}`);
      const d = await res.json();
      if (d.active) { setConnected(true); setVerifyToken(d.verifyToken ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleSave() {
    if (!pageAccessToken.trim()) { setErr("Cole o Page Access Token."); return; }
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/facebook-leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, pageAccessToken: pageAccessToken.trim(), pageId: pageId.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao conectar."); return; }
      setConnected(true); setVerifyToken(d.verifyToken ?? null); setPageName(d.pageName ?? null);
      setPageAccessToken(""); setPageId("");
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/facebook-leads?userId=${userId}`, { method: "DELETE" });
      setConnected(false); setVerifyToken(null); setPageName(null);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const webhookUrl = typeof window !== "undefined" && userId
    ? `${window.location.origin}/api/webhook/facebook-leads?userId=${userId}`
    : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm" style={{ background: "#1877f2", color: "#fff" }}>f</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Facebook Lead Ads</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#172554", color: "#60a5fa" }}>META</span>
            </div>
            <p className="text-xs text-gray-500">Leads de formulários Facebook & Instagram Ads</p>
          </div>
        </div>
        <StatusBadge active={connected} />
      </div>
      <Err msg={err} />
      {connected ? (
        <div className="space-y-3">
          {pageName && <p className="text-xs text-gray-400">Página: <span className="font-bold text-white">{pageName}</span></p>}
          {webhookUrl && <WebhookBox label="URL do Webhook (cole no Meta Developers)" url={webhookUrl} />}
          {verifyToken && (
            <div className="rounded-xl px-3 py-2 text-xs font-mono" style={{ background: "#111", border: "1px solid #2e2e2e" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-500 font-sans font-semibold">Verify Token (campo no Meta Developers):</span>
                <button onClick={() => navigator.clipboard.writeText(verifyToken)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-sans">Copiar</button>
              </div>
              <span className="text-yellow-400 break-all">{verifyToken}</span>
            </div>
          )}
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#0d1f3c", border: "1px solid #1e3a5f" }}>
            <p className="font-semibold text-blue-300">Passos finais no Meta Developers:</p>
            <p>1. Acesse <code className="text-blue-400">developers.facebook.com</code> → seu App</p>
            <p>2. Vá em <code className="text-blue-400">Webhooks → Página → Editar</code></p>
            <p>3. Cole a <strong className="text-white">URL do Webhook</strong> e o <strong className="text-white">Verify Token</strong> acima</p>
            <p>4. Assine o campo <code className="text-blue-400">leadgen</code></p>
            <p>5. Salve — leads dos formulários chegam automaticamente</p>
          </div>
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: "#7f1d1d" }}>
            {busy ? "Desconectando..." : "Desconectar Facebook Leads"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Conecte sua Página do Facebook para capturar leads de formulários de anúncios automaticamente.</p>
          <input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="Page ID (opcional — ex: 123456789)"
            className={inp} style={inpStyle} />
          <input value={pageAccessToken} onChange={e => setPageAccessToken(e.target.value)} placeholder="Page Access Token (EAAxxxxx...)"
            className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
          <button onClick={handleSave} disabled={saving || !pageAccessToken.trim()}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#1877f2" }}>
            {saving ? "Conectando..." : "Conectar Facebook Lead Ads"}
          </button>
          <div className="rounded-xl p-3 text-xs text-gray-500 space-y-1" style={{ background: "#111", border: "1px dashed #3a3a3a" }}>
            <p className="font-semibold text-gray-300">Como obter o Page Access Token:</p>
            <p>1. Acesse <code className="text-blue-400">developers.facebook.com</code> → Graph API Explorer</p>
            <p>2. Selecione seu App e sua Página</p>
            <p>3. Permissões: <code className="text-blue-400">pages_read_engagement</code>, <code className="text-blue-400">leads_retrieval</code></p>
            <p>4. Gere um token de longa duração para uso permanente</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { userId } = useUserId();

  return (
    <main className="min-h-screen p-6" style={{ background: "#111111" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Integrações</h1>
          <p className="text-sm text-gray-400 mt-0.5">Conecte WhatsApp, portais de veículos e anúncios para receber leads automaticamente.</p>
        </div>

        {/* ── Mensageria ── */}
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-3">💬 Mensageria</p>
          <div className="space-y-4">
            <ZApiCard userId={userId} />
            <InstagramCard userId={userId} />
            <WhatsAppMetaCard userId={userId} />
          </div>
        </div>

        {/* ── Portais de Veículos ── */}
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-3">🚗 Portais de Veículos</p>
          <div className="space-y-4">
            <OlxCard userId={userId} />
            <WebmotorsCard userId={userId} />
            <ICarrosCard userId={userId} />
          </div>
        </div>

        {/* ── Anúncios / Meta ── */}
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-3">📢 Anúncios / Meta Ads</p>
          <div className="space-y-4">
            <FacebookLeadsCard userId={userId} />
          </div>
        </div>

        {/* ── Referência de Webhooks ── */}
        <div className="rounded-2xl p-4" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Referência de Webhooks</p>
          <div className="space-y-2">
            {[
              { label: "Z-API WhatsApp",    url: "/api/webhook/zapi" },
              { label: "Instagram / Meta",  url: "/api/webhook/meta" },
              { label: "OLX Pro",           url: "/api/webhook/olx?token=SEU_TOKEN" },
              { label: "Webmotors",         url: "/api/webhook/webmotors?token=SEU_TOKEN" },
              { label: "iCarros",           url: "/api/webhook/icarros?token=SEU_TOKEN" },
              { label: "Facebook Lead Ads", url: "/api/webhook/facebook-leads?userId=SEU_ID" },
            ].map(({ label, url }) => (
              <div key={url} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 shrink-0">{label}</span>
                <code className="text-xs text-green-400 font-mono truncate">{url}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
