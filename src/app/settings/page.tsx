"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = getSupabaseBrowser();

/* ── estilos ──────────────────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "#1a1a1a", border: "1px solid #2e2e2e",
  borderRadius: 16, padding: "24px", marginBottom: 16,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#555",
  textTransform: "uppercase", letterSpacing: 1, marginBottom: 18,
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  background: "#111", border: "1px solid #333",
  borderRadius: 10, color: "#fff", fontSize: 14,
  outline: "none", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  display: "block", color: "#777", fontSize: 12,
  fontWeight: 600, marginBottom: 6,
};
function Btn({ children, onClick, disabled, variant = "primary", style = {} }:
  { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary"|"ghost"|"danger"; style?: React.CSSProperties }) {
  const bg = variant === "primary" ? "#dc2626" : variant === "danger" ? "#7f1d1d" : "#2e2e2e";
  const co = variant === "danger" ? "#fca5a5" : "#fff";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "9px 18px", borderRadius: 10, border: "none", fontWeight: 700,
        fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "#1f1f1f" : bg, color: disabled ? "#555" : co,
        transition: "opacity .2s", ...style }}>
      {children}
    </button>
  );
}

/* ── Z-API section ────────────────────────────────────────────────── */
function ZapiSection({ userId }: { userId: string }) {
  type ZStatus = "idle"|"loading"|"connected"|"disconnected"|"qrcode"|"error";
  const [status,     setStatus]     = useState<ZStatus>("idle");
  const [phone,      setPhone]      = useState<string|null>(null);
  const [instance,   setInstance]   = useState<string|null>(null);
  const [qrBase64,   setQrBase64]   = useState<string|null>(null);
  const [err,        setErr]        = useState<string|null>(null);

  /* formulário de nova conexão */
  const [showForm,   setShowForm]   = useState(false);
  const [zapiInst,   setZapiInst]   = useState("");
  const [zapiToken,  setZapiToken]  = useState("");
  const [zapiClient, setZapiClient] = useState("");
  const [saving,     setSaving]     = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  /* verifica status atual */
  const checkStatus = useCallback(async () => {
    setStatus("loading"); setErr(null);
    try {
      const r = await fetch(`/api/integrations/zapi?userId=${userId}`);
      const d = await r.json();
      if (d.active) {
        setStatus("connected");
        setPhone(d.phone ?? null);
        setInstance(d.instance ?? null);
        stopPoll();
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("error"); setErr("Erro ao verificar conexão");
    }
  }, [userId, stopPoll]);

  useEffect(() => { checkStatus(); }, [checkStatus]);
  useEffect(() => () => stopPoll(), [stopPoll]);

  /* polling do QR após salvar credenciais */
  const pollQR = useCallback(async (inst: string, tok: string, cli: string) => {
    try {
      const r = await fetch(
        `/api/onboarding/zapi-qr?instance=${encodeURIComponent(inst)}&token=${encodeURIComponent(tok)}&clientToken=${encodeURIComponent(cli)}`
      );
      const d = await r.json();
      if (d.status === "connected") {
        setStatus("connected"); setPhone(d.phone ?? null); setInstance(inst);
        setQrBase64(null); setShowForm(false); stopPoll();
      } else if (d.status === "qrcode" && d.base64) {
        setStatus("qrcode"); setQrBase64(d.base64);
      }
    } catch { /* ignora — tenta no próximo tick */ }
  }, [stopPoll]);

  /* salva novas credenciais */
  async function handleSave() {
    if (!zapiInst.trim() || !zapiToken.trim() || !zapiClient.trim()) {
      setErr("Preencha todos os campos Z-API."); return;
    }
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/integrations/zapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, instance: zapiInst.trim(), token: zapiToken.trim(), clientToken: zapiClient.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Erro ao salvar"); setSaving(false); return; }
      /* inicia polling QR */
      stopPoll();
      setStatus("qrcode"); setQrBase64(null);
      pollQR(zapiInst.trim(), zapiToken.trim(), zapiClient.trim());
      pollRef.current = setInterval(() => pollQR(zapiInst.trim(), zapiToken.trim(), zapiClient.trim()), 5_000);
    } catch { setErr("Erro de rede"); }
    setSaving(false);
  }

  /* desconecta */
  async function handleDisconnect() {
    if (!confirm("Desconectar WhatsApp? O agente Paulo vai parar de responder.")) return;
    await fetch(`/api/integrations/zapi?userId=${userId}`, { method: "DELETE" });
    setStatus("disconnected"); setPhone(null); setInstance(null);
    setQrBase64(null); setShowForm(false); stopPoll();
  }

  return (
    <div style={card}>
      <p style={sectionTitle}>WhatsApp — Z-API</p>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
          background: status === "connected" ? "#22c55e"
            : status === "loading" ? "#f59e0b"
            : status === "qrcode" ? "#3b82f6" : "#3a3a3a",
        }} />
        <div>
          <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>
            {status === "connected"    ? `Conectado${phone ? ` — ${phone}` : ""}`
            : status === "loading"     ? "Verificando conexão..."
            : status === "qrcode"      ? "Aguardando leitura do QR Code"
            : status === "error"       ? "Erro ao verificar"
            :                           "Desconectado"}
          </p>
          {instance && status === "connected" && (
            <p style={{ color: "#555", fontSize: 11, margin: "2px 0 0" }}>Instância: {instance}</p>
          )}
        </div>
      </div>

      {/* QR Code */}
      {status === "qrcode" && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {qrBase64 ? (
            <>
              <p style={{ color: "#aaa", fontSize: 13, marginBottom: 10 }}>
                📱 Abra o WhatsApp → Dispositivos Vinculados → Escanear QR Code
              </p>
              <img src={qrBase64} alt="QR Code" style={{ width: 200, height: 200, borderRadius: 10, border: "2px solid #2e2e2e" }} />
              <p style={{ color: "#555", fontSize: 11, marginTop: 6 }}>Atualizando a cada 5s...</p>
            </>
          ) : (
            <div style={{ padding: "20px 0" }}>
              <div style={{ width: 28, height: 28, border: "3px solid #dc2626", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
              <p style={{ color: "#666", fontSize: 13 }}>Gerando QR code...</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
        </div>
      )}

      {/* Formulário de conexão */}
      {(showForm || status === "disconnected") && status !== "qrcode" && status !== "connected" && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: "#666", fontSize: 12, marginBottom: 14 }}>
            Não tem conta?{" "}
            <a href="https://app.z-api.io" target="_blank" rel="noopener noreferrer"
              style={{ color: "#dc2626" }}>Criar na Z-API →</a>
          </p>
          {[
            { label: "Instance ID", val: zapiInst, set: setZapiInst, ph: "3F1A434D..." },
            { label: "Token",       val: zapiToken, set: setZapiToken, ph: "E94BDBB3..." },
            { label: "Client-Token",val: zapiClient,set: setZapiClient,ph: "F14d0362..." },
          ].map(({ label: l, val, set, ph }) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <label style={lbl}>{l}</label>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inp} />
            </div>
          ))}
        </div>
      )}

      {err && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</p>}

      {/* Ações */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {status === "connected" && (
          <>
            <Btn variant="ghost" onClick={() => { setShowForm(true); setStatus("disconnected"); }}>
              🔄 Reconectar
            </Btn>
            <Btn variant="danger" onClick={handleDisconnect}>
              Desconectar
            </Btn>
          </>
        )}
        {(status === "disconnected" || status === "error") && (
          <Btn onClick={handleSave} disabled={saving}>
            {saving ? "Conectando..." : "Conectar WhatsApp"}
          </Btn>
        )}
        {status === "qrcode" && (
          <Btn variant="ghost" onClick={() => { stopPoll(); setStatus("disconnected"); setQrBase64(null); }}>
            Cancelar
          </Btn>
        )}
        {status === "connected" && (
          <Btn variant="ghost" onClick={checkStatus}>↻ Atualizar</Btn>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [userId,  setUserId]  = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [erro,    setErro]    = useState<string|null>(null);

  /* dados da loja */
  const [bizName,   setBizName]   = useState("");
  const [cnpj,      setCnpj]      = useState("");
  const [storePhone,setStorePhone]= useState("");
  const [address,   setAddress]   = useState("");
  const [notifyPh,  setNotifyPh]  = useState("");
  const [sellers,   setSellers]   = useState<string[]>([]);
  const [newSeller, setNewSeller] = useState("");
  const [plan,      setPlan]      = useState<string|null>(null);

  /* IA */
  const [aiEnabled,     setAiEnabled]     = useState(false);
  const [aiName,        setAiName]        = useState("Paulo");
  const [aiPersonality, setAiPersonality] = useState("");

  const load = useCallback(async (uid: string) => {
    const r = await fetch(`/api/settings?userId=${uid}`);
    if (!r.ok) return;
    const d = await r.json();
    setBizName(d.business_name ?? "");
    setCnpj(d.cnpj ?? "");
    setStorePhone(d.store_phone ?? "");
    setAddress(d.address ?? "");
    setNotifyPh(d.notify_phone ?? "");
    setSellers(Array.isArray(d.sellers) ? d.sellers : []);
    setPlan(d.plan ?? null);
    setAiEnabled(d.ai_enabled ?? false);
    setAiName(d.ai_name ?? "Paulo");
    setAiPersonality(d.ai_personality ?? "");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { window.location.href = "/login"; return; }
      setUserId(data.user.id);
      load(data.user.id).finally(() => setLoading(false));
    });
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setErro(null);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          business_name:  bizName    || null,
          cnpj:           cnpj       || null,
          store_phone:    storePhone || null,
          address:        address    || null,
          notify_phone:   notifyPh   || null,
          sellers,
          ai_enabled:     aiEnabled,
          ai_name:        aiName     || "Paulo",
          ai_personality: aiPersonality || null,
        }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { setErro(err instanceof Error ? err.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  function addSeller() {
    const n = newSeller.trim();
    if (!n || sellers.includes(n) || sellers.length >= 15) return;
    setSellers(p => [...p, n]); setNewSeller("");
  }

  if (loading) return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
      <p style={{ color: "#555" }}>Carregando...</p>
    </main>
  );

  const field = (lbl2: string, val: string, set: (v: string) => void, ph = "") => (
    <div style={{ marginBottom: 14 }}>
      <label style={lbl}>{lbl2}</label>
      <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inp} />
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", padding: "24px", background: "#111", fontFamily: "Segoe UI, sans-serif" }}>
      <div style={{ maxWidth: 580, margin: "0 auto" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>Configurações</h1>
          <p style={{ color: "#555", fontSize: 13, marginTop: 4 }}>Gerencie sua loja e o agente Paulo</p>
        </div>

        <form onSubmit={handleSave}>

          {/* ── Dados da loja ── */}
          <div style={card}>
            <p style={sectionTitle}>Dados da loja</p>
            {field("Nome da loja", bizName, setBizName, "Auto Prime Fortaleza")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("CNPJ", cnpj, setCnpj, "00.000.000/0001-00")}
              {field("Telefone da loja", storePhone, setStorePhone, "(85) 3333-0000")}
            </div>
            {field("Endereço", address, setAddress, "Rua, número, bairro, cidade")}
            {field("Celular para alertas de lead quente", notifyPh, setNotifyPh, "(85) 99999-0000")}
            {plan && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ color: "#555", fontSize: 12 }}>Plano:</span>
                <span style={{ background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                  {plan.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* ── Agente Paulo ── */}
          <div style={card}>
            <p style={sectionTitle}>Agente Paulo — IA</p>

            {/* toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}>
              <div onClick={() => setAiEnabled(v => !v)}
                style={{ width: 42, height: 24, borderRadius: 12, position: "relative", transition: "background .2s",
                  background: aiEnabled ? "#dc2626" : "#2e2e2e", cursor: "pointer", flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute",
                  top: 3, transition: "left .2s", left: aiEnabled ? 21 : 3 }} />
              </div>
              <div>
                <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {aiEnabled ? "Paulo ativo — respondendo automaticamente" : "Paulo pausado"}
                </p>
                <p style={{ color: "#555", fontSize: 12, margin: 0 }}>
                  {aiEnabled ? "Desative para assumir o atendimento manualmente" : "Ative para automatizar as respostas no WhatsApp"}
                </p>
              </div>
            </label>

            {aiEnabled && (
              <>
                {field("Nome do agente", aiName, setAiName, "Paulo")}
                <div>
                  <label style={lbl}>Personalidade do agente</label>
                  <textarea value={aiPersonality} onChange={e => setAiPersonality(e.target.value)}
                    rows={4} placeholder="Descreva como o agente deve se comportar. Ex: Seja direto, use linguagem informal, foque em financiamento..."
                    style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
                  <p style={{ color: "#444", fontSize: 11, marginTop: 6 }}>
                    Deixe em branco para usar a personalidade padrão do Paulo.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* ── Equipe ── */}
          <div style={card}>
            <p style={sectionTitle}>Equipe de vendas</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newSeller} onChange={e => setNewSeller(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSeller())}
                placeholder="Nome do vendedor" style={{ ...inp, flex: 1 }} />
              <Btn onClick={addSeller}>+</Btn>
            </div>
            {sellers.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {sellers.map(s => (
                  <span key={s} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2e2e2e", color: "#ccc", fontSize: 12, padding: "4px 12px", borderRadius: 20 }}>
                    {s}
                    <button type="button" onClick={() => setSellers(p => p.filter(x => x !== s))}
                      style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <p style={{ color: "#444", fontSize: 11 }}>{sellers.length}/15 vendedores</p>
          </div>

          {/* feedback + botão salvar */}
          {erro && <p style={{ color: "#f87171", fontSize: 13, background: "#2a0a0a", padding: "10px 14px", borderRadius: 10, marginBottom: 12 }}>{erro}</p>}
          {saved && <p style={{ color: "#6ee7b7", fontSize: 13, background: "#022c22", padding: "10px 14px", borderRadius: 10, marginBottom: 12 }}>✅ Configurações salvas!</p>}

          <Btn disabled={saving} style={{ width: "100%", padding: "12px", fontSize: 14, marginBottom: 16 }}>
            {saving ? "Salvando..." : "Salvar configurações"}
          </Btn>
        </form>

        {/* ── WhatsApp Z-API (fora do form) ── */}
        {userId && <ZapiSection userId={userId} />}

        {/* ── Conta ── */}
        <div style={card}>
          <p style={sectionTitle}>Conta</p>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            style={{ background: "none", border: "none", color: "#dc2626", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            Sair da conta
          </button>
        </div>

      </div>
    </main>
  );
}
