"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

const supabase = getSupabaseBrowser();

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1, label: "Sua Loja"   },
  { n: 2, label: "WhatsApp"   },
  { n: 3, label: "Tudo pronto"},
];

/* ─── estilos reutilizáveis ─────────────────────────────────────── */
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  background: "#111", border: "1px solid #333",
  borderRadius: "10px", color: "#fff",
  fontSize: "14px", outline: "none", boxSizing: "border-box",
};
const btn = (primary = true): React.CSSProperties => ({
  padding: "11px 24px", borderRadius: "10px", border: "none",
  fontWeight: 700, fontSize: "14px", cursor: "pointer",
  background: primary ? "#e63946" : "#2e2e2e",
  color: "#fff", transition: "opacity .2s",
});
const label: React.CSSProperties = {
  display: "block", color: "#888", fontSize: "12px",
  fontWeight: 600, marginBottom: "6px",
};

/* ─── componente principal ──────────────────────────────────────── */
export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId]   = useState<string | null>(null);
  const [step,   setStep]     = useState<Step>(1);
  const [err,    setErr]      = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  /* step 1 */
  const [bizName,  setBizName]  = useState("");
  const [notifyPh, setNotifyPh] = useState("");

  /* step 2 — Z-API */
  const [zapiInst,   setZapiInst]   = useState("");
  const [zapiToken,  setZapiToken]  = useState("");
  const [zapiClient, setZapiClient] = useState("");
  const [qrStatus,   setQrStatus]   = useState<"idle"|"loading"|"qrcode"|"connected"|"error">("idle");
  const [qrBase64,   setQrBase64]   = useState<string | null>(null);
  const [connPhone,  setConnPhone]  = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* step 3 */
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
    });
  }, [router]);

  /* ─── polling QR / status ─────────────────────────────────────── */
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const fetchQR = useCallback(async () => {
    if (!zapiInst || !zapiToken || !zapiClient) return;
    try {
      const r = await fetch(
        `/api/onboarding/zapi-qr?instance=${encodeURIComponent(zapiInst)}&token=${encodeURIComponent(zapiToken)}&clientToken=${encodeURIComponent(zapiClient)}`
      );
      const d = await r.json();
      if (d.status === "connected") {
        setQrStatus("connected");
        setConnPhone(d.phone ?? null);
        stopPoll();
      } else if (d.status === "qrcode" && d.base64) {
        setQrStatus("qrcode");
        setQrBase64(d.base64);
      } else if (d.error) {
        setQrStatus("error");
        setErr(d.error);
        stopPoll();
      } else {
        setQrStatus("loading");
      }
    } catch {
      setQrStatus("error");
      setErr("Erro ao buscar QR code");
      stopPoll();
    }
  }, [zapiInst, zapiToken, zapiClient, stopPoll]);

  function startPoll() {
    stopPoll();
    setQrStatus("loading");
    setQrBase64(null);
    setErr(null);
    fetchQR();
    pollRef.current = setInterval(fetchQR, 5_000);
  }

  useEffect(() => () => stopPoll(), [stopPoll]);

  /* ─── Step 1: salva dados da loja ────────────────────────────── */
  async function saveStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!bizName.trim()) { setErr("Informe o nome da loja."); return; }
    setSaving(true); setErr(null);
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, business_name: bizName.trim(), notify_phone: notifyPh.trim() || null }),
    });
    setSaving(false);
    if (!r.ok) { const d = await r.json(); setErr(d.error); return; }
    setStep(2);
  }

  /* ─── Step 2: valida credenciais Z-API ───────────────────────── */
  async function handleConnectZapi(e: React.FormEvent) {
    e.preventDefault();
    if (!zapiInst.trim() || !zapiToken.trim() || !zapiClient.trim()) {
      setErr("Preencha todos os campos da Z-API."); return;
    }
    setErr(null);
    startPoll();
  }

  /* ─── Step 2 → 3: finaliza onboarding ──────────────────────── */
  async function finishOnboarding() {
    setSaving(true); setErr(null);
    const r = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        business_name:     bizName,
        notify_phone:      notifyPh,
        zapi_instance:     zapiInst     || null,
        zapi_token:        zapiToken    || null,
        zapi_client_token: zapiClient   || null,
        zapi_phone:        connPhone    || null,
      }),
    });
    setSaving(false);
    if (!r.ok) { const d = await r.json(); setErr(d.error); return; }
    setDone(true);
    setStep(3);
  }

  /* ─── render ─────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Segoe UI, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>

        {/* logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ width: 52, height: 52, background: "#e63946", borderRadius: 14, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#fff" }}>7</div>
          <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>Configurar minha loja</h1>
          <p style={{ color: "#555", fontSize: 13, margin: "4px 0 0" }}>Leva menos de 5 minutos</p>
        </div>

        {/* steps indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 13,
                  background: step > s.n ? "#10b981" : step === s.n ? "#e63946" : "#2e2e2e",
                  color: "#fff",
                }}>
                  {step > s.n ? "✓" : s.n}
                </div>
                <span style={{ fontSize: 10, color: step === s.n ? "#e63946" : "#555", whiteSpace: "nowrap" }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 60, height: 2, background: step > s.n ? "#10b981" : "#2e2e2e", margin: "0 4px", marginBottom: 18 }} />
              )}
            </div>
          ))}
        </div>

        {/* card */}
        <div style={{ background: "#232323", border: "1px solid #2e2e2e", borderRadius: 18, padding: "32px" }}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <form onSubmit={saveStep1}>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>Dados da sua loja</h2>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Nome da loja *</label>
                <input value={bizName} onChange={e => setBizName(e.target.value)}
                  placeholder="Ex: Auto Prime Fortaleza" style={inp} required />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={label}>Celular para alertas de lead quente</label>
                <input value={notifyPh} onChange={e => setNotifyPh(e.target.value)}
                  placeholder="(85) 99999-0000" style={inp} />
                <p style={{ color: "#555", fontSize: 11, marginTop: 6 }}>
                  Você receberá uma notificação no WhatsApp quando um lead quente entrar.
                </p>
              </div>
              {err && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</p>}
              <button type="submit" disabled={saving} style={{ ...btn(), width: "100%" }}>
                {saving ? "Salvando..." : "Continuar →"}
              </button>
            </form>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>Conectar WhatsApp</h2>
              <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
                Use sua conta <strong style={{ color: "#aaa" }}>Z-API</strong>. Não tem?{" "}
                <a href="https://app.z-api.io" target="_blank" rel="noopener noreferrer" style={{ color: "#e63946" }}>Criar conta grátis →</a>
              </p>

              <form onSubmit={handleConnectZapi}>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>Instance ID</label>
                  <input value={zapiInst} onChange={e => setZapiInst(e.target.value)} placeholder="3F1A434D..." style={inp} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>Token</label>
                  <input value={zapiToken} onChange={e => setZapiToken(e.target.value)} placeholder="E94BDBB3..." style={inp} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Client-Token</label>
                  <input value={zapiClient} onChange={e => setZapiClient(e.target.value)} placeholder="F14d0362..." style={inp} />
                </div>
                <button type="submit" style={{ ...btn(), width: "100%", marginBottom: 20 }}>
                  {qrStatus === "loading" ? "Conectando..." : "Gerar QR Code"}
                </button>
              </form>

              {/* QR Code area */}
              {qrStatus === "loading" && (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ width: 32, height: 32, border: "3px solid #e63946", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
                  <p style={{ color: "#666", fontSize: 13 }}>Gerando QR code...</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {qrStatus === "qrcode" && qrBase64 && (
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: "#aaa", fontSize: 13, marginBottom: 12 }}>
                    📱 Abra o WhatsApp → Dispositivos Vinculados → Escanear QR Code
                  </p>
                  <img src={qrBase64} alt="QR Code WhatsApp" style={{ width: 220, height: 220, borderRadius: 12, border: "2px solid #2e2e2e" }} />
                  <p style={{ color: "#555", fontSize: 11, marginTop: 8 }}>Atualizando automaticamente...</p>
                </div>
              )}

              {qrStatus === "connected" && (
                <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid #10b981", borderRadius: 12, padding: "16px", textAlign: "center" }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>✅</p>
                  <p style={{ color: "#10b981", fontWeight: 700, fontSize: 15 }}>WhatsApp conectado!</p>
                  {connPhone && <p style={{ color: "#555", fontSize: 13, marginTop: 4 }}>{connPhone}</p>}
                </div>
              )}

              {err && <p style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{err}</p>}

              {/* botões de navegação */}
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button onClick={() => { stopPoll(); setStep(1); }} style={{ ...btn(false), flex: 1 }}>
                  ← Voltar
                </button>
                <button
                  onClick={finishOnboarding}
                  disabled={saving}
                  style={{ ...btn(qrStatus === "connected"), flex: 2, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Ativando..." : qrStatus === "connected" ? "Ativar Paulo →" : "Pular por agora →"}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && done && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
                Loja configurada!
              </h2>
              <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
                O agente <strong style={{ color: "#e63946" }}>Paulo</strong> está ativo e pronto para atender seus leads automaticamente no WhatsApp.
              </p>

              <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "16px", marginBottom: 24, textAlign: "left" }}>
                <p style={{ color: "#555", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Próximos passos</p>
                {[
                  { icon: "🚗", txt: "Cadastre seus veículos no Estoque" },
                  { icon: "📱", txt: "Envie uma mensagem de teste para o seu WhatsApp" },
                  { icon: "📊", txt: "Acompanhe seus leads no Funil" },
                ].map(({ icon, txt }) => (
                  <div key={txt} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <span style={{ color: "#aaa", fontSize: 13 }}>{txt}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => router.push("/")} style={{ ...btn(), width: "100%", fontSize: 15, padding: "14px" }}>
                Acessar meu CRM →
              </button>
            </div>
          )}
        </div>

        {/* skip */}
        {step !== 3 && (
          <p style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer" }}>
              Configurar depois →
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
