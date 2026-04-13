"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function useUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem("crm_userId");
    if (stored) { setUserId(stored); return; }
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) { localStorage.setItem("crm_userId", data.user.id); setUserId(data.user.id); }
    });
  }, []);
  return userId;
}

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

// ─── UltraMsg ─────────────────────────────────────────────────────────────────
function UltraMsgCard({ userId }: { userId: string | null }) {
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/integrations/ultramsg?userId=${uid}`);
      if (!res.ok) return;
      const d = await res.json();
      if (d.active) { setConnected(true); setPhone(d.phone ?? null); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (userId) load(userId); }, [userId, load]);

  async function handleSave() {
    if (!instance.trim() || !token.trim()) { setErr("Preencha Instance ID e Token."); return; }
    if (!userId) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch("/api/integrations/ultramsg", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, instance: instance.trim(), token: token.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Erro ao conectar."); return; }
      setConnected(true); setPhone(d.phone ?? null); setInstance(""); setToken("");
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/ultramsg?userId=${userId}`, { method: "DELETE" });
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
              <h2 className="text-sm font-bold text-white">UltraMsg WhatsApp</h2>
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
          <div className="rounded-xl px-3 py-2 text-xs font-mono" style={{ background: "#111", border: "1px solid #2e2e2e" }}>
            <span className="text-gray-500 block mb-1 font-sans font-semibold">Webhook URL:</span>
            <span className="text-green-400 break-all">{typeof window !== "undefined" ? `${window.location.origin}/api/webhook/ultramsg` : "/api/webhook/ultramsg"}</span>
          </div>
          <button onClick={handleDisconnect} disabled={busy}
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "#7f1d1d" }}>
            {busy ? "Desconectando..." : "Desconectar UltraMsg"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={instance} onChange={e => setInstance(e.target.value)} placeholder="Instance ID (ex: instance12345)"
            className={inp} style={inpStyle} />
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="Token UltraMsg"
            className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
          <button onClick={handleSave} disabled={saving || !instance.trim() || !token.trim()}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#16a34a" }}>
            {saving ? "Conectando..." : "Conectar UltraMsg"}
          </button>
          <p className="text-xs text-gray-500">Configure o webhook no painel UltraMsg: <code className="text-green-400">/api/webhook/ultramsg</code></p>
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
            className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "#7f1d1d" }}>
            {busy ? "Desconectando..." : "Desconectar Instagram"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="Page ID (opcional)"
            className={inp} style={inpStyle} />
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="Page Access Token"
            className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
          <button onClick={handleSave} disabled={saving || !token.trim()}
            className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#db2777" }}>
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

function WhatsAppMetaCard() {
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
    const uid = localStorage.getItem("crm_userId");
    if (uid) loadStatus(uid);
  }, [loadStatus]);

  function handleOAuthResult(uid: string | null, errStr: string | null) {
    if (errStr) { setOauthError(errStr); return; }
    if (uid) { localStorage.setItem("crm_userId", uid); loadStatus(uid); }
  }

  async function handleSaveManual() {
    if (!token.trim()) { setErr("Cole o token antes de salvar."); return; }
    setErr(null); setSaving(true);
    try {
      const uid = localStorage.getItem("crm_userId");
      const body: Record<string, string> = { token: token.trim() };
      if (uid) body.userId = uid;
      const res = await fetch("/api/integrations/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setErr(data?.error ?? "Erro ao salvar."); return; }
      if (data?.userId) localStorage.setItem("crm_userId", data.userId);
      setPhone(data?.displayPhone ?? null); setBizName(data?.businessName ?? null);
      setConnected(true); setToken(""); setShowManual(false);
    } catch { setErr("Erro de rede."); }
    finally { setSaving(false); }
  }

  async function handleDisconnect() {
    const uid = localStorage.getItem("crm_userId");
    if (!uid) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/whatsapp?userId=${uid}`, { method: "DELETE" });
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
              <p className="text-xs text-yellow-400 bg-yellow-950 border border-yellow-800 rounded-xl px-3 py-2">
                ⚠ Token expira em {daysLeft} dia(s). Reconecte para continuar.
              </p>
            )}
            {tokenExpired && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2">
                Token expirado. Reconecte agora.
              </p>
            )}
            <button onClick={handleDisconnect} disabled={busy}
              className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "#7f1d1d" }}>
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
                <input value={token} onChange={e => setToken(e.target.value)} placeholder="EAAxxxxx..."
                  className={inp} style={{ ...inpStyle, fontFamily: "monospace" }} />
                <button onClick={handleSaveManual} disabled={saving || !token.trim()}
                  className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "#1d4ed8" }}>
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


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const userId = useUserId();

  return (
    <main className="min-h-screen p-6" style={{ background: "#111111" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Integracoes</h1>
          <p className="text-sm text-gray-400 mt-0.5">Conecte WhatsApp e Instagram para receber leads automaticamente.</p>
        </div>

        <div className="space-y-4">
          <UltraMsgCard userId={userId} />
          <InstagramCard userId={userId} />
          <WhatsAppMetaCard />
        </div>

        <div className="mt-6 rounded-2xl p-4" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Webhook URLs</p>
          <div className="space-y-2">
            {[
              { label: "UltraMsg WhatsApp", url: "/api/webhook/ultramsg" },
              { label: "Instagram / Meta", url: "/api/webhook/meta" },
            ].map(({ label, url }) => (
              <div key={url} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{label}</span>
                <code className="text-xs text-green-400 font-mono">{url}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
