"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function LoginContent() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"login" | "register">(
    params.get("tab") === "register" ? "register" : "login"
  );
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [name,        setName]        = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [message,     setMessage]     = useState<string | null>(null);

  /* esqueci minha senha */
  const [forgotMode,  setForgotMode]  = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent,  setForgotSent]  = useState(false);
  const [forgotLoad,  setForgotLoad]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("E-mail ou senha incorretos."); setLoading(false); return; }
    window.location.href = "/";
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("users").upsert({
        id: userId, email,
        business_name: name || null,
        trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        plan_status: "trial",
      });
      window.location.href = "/onboarding";
      return;
    }
    setMessage("✅ Conta criada!");
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoad(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setForgotSent(true);
    setForgotLoad(false);
  }

  /* ── Tela de recuperação de senha ── */
  if (forgotMode) {
    return (
      <div style={outerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={logoStyle}>7</div>
            <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>Recuperar senha</h1>
            <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>
              Enviaremos um link para o seu e-mail
            </p>
          </div>

          {forgotSent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
              <p style={{ color: "#10b981", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                Link enviado!
              </p>
              <p style={{ color: "#888", fontSize: 13, marginBottom: 24 }}>
                Verifique sua caixa de entrada em <strong style={{ color: "#fff" }}>{forgotEmail}</strong>
              </p>
              <button onClick={() => { setForgotMode(false); setForgotSent(false); }} style={btnPrimary}>
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot}>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>E-mail da sua conta</label>
                <input type="email" placeholder="seu@email.com" value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)} required style={inputStyle} />
              </div>
              <button type="submit" disabled={forgotLoad} style={btnPrimary}>
                {forgotLoad ? "Enviando..." : "Enviar link de recuperação"}
              </button>
              <button type="button" onClick={() => setForgotMode(false)}
                style={{ ...btnSecondary, marginTop: 10, width: "100%" }}>
                ← Voltar
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  /* ── Tela principal ── */
  return (
    <div style={outerStyle}>
      <div style={cardStyle}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={logoStyle}>7</div>
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: 0 }}>CRM 7Business</h1>
          <p style={{ color: "#888", fontSize: "14px", margin: "4px 0 0" }}>Gestão de leads para sua loja</p>
        </div>

        {/* Tabs */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px",
          background: "#111", borderRadius: "10px", padding: "4px", marginBottom: "28px",
        }}>
          {(["login", "register"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(null); setMessage(null); }}
              style={{
                padding: "8px", borderRadius: "8px", border: "none",
                cursor: "pointer", fontWeight: 600, fontSize: "14px", transition: "all .2s",
                background: tab === t ? "#e63946" : "transparent",
                color: tab === t ? "#fff" : "#888",
              }}>
              {t === "login" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>

        {message && (
          <div style={{ background: "#064e3b", border: "1px solid #10b981", color: "#6ee7b7",
            borderRadius: "8px", padding: "12px", marginBottom: "20px", fontSize: "14px" }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ background: "#2a0a0a", border: "1px solid #e63946", color: "#fca5a5",
            borderRadius: "8px", padding: "12px", marginBottom: "20px", fontSize: "14px" }}>
            {error}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={tab === "login" ? handleLogin : handleRegister}>
          {tab === "register" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Nome da loja</label>
              <input type="text" placeholder="Ex: PH Autoscar" value={name}
                onChange={e => setName(e.target.value)} style={inputStyle} />
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>E-mail</label>
            <input type="email" placeholder="seu@email.com" value={email}
              onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </div>

          {/* Senha com olho */}
          <div style={{ marginBottom: tab === "login" ? "12px" : "24px" }}>
            <label style={labelStyle}>Senha</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6} style={{ ...inputStyle, paddingRight: "44px" }} />
              <button type="button" onClick={() => setShowPass(p => !p)} tabIndex={-1}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "#666",
                  display: "flex", alignItems: "center", padding: "2px" }}>
                {showPass ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Esqueci minha senha — só no tab login */}
          {tab === "login" && (
            <div style={{ textAlign: "right", marginBottom: "20px" }}>
              <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                style={{ background: "none", border: "none", color: "#e63946", fontSize: "12px",
                  cursor: "pointer", fontWeight: 600, padding: 0 }}>
                Esqueci minha senha
              </button>
            </div>
          )}

          <button type="submit" disabled={loading} style={btnPrimary}>
            {loading ? "Aguarde..." : tab === "login" ? "Entrar no CRM" : "Criar minha conta"}
          </button>
        </form>

        <p style={{ textAlign: "center", margin: "16px 0 0", fontSize: "12px", color: "#555" }}>
          Suporte:{" "}
          <a href="mailto:7businesscrm@gmail.com" style={{ color: "#e63946", textDecoration: "none" }}>
            7businesscrm@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

/* ── estilos ── */
const outerStyle: React.CSSProperties = {
  minHeight: "100vh", background: "#1a1a1a",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "Segoe UI, sans-serif", padding: "20px",
};
const cardStyle: React.CSSProperties = {
  background: "#232323", border: "1px solid #333", borderRadius: "18px",
  padding: "40px", width: "100%", maxWidth: "420px",
  boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
};
const logoStyle: React.CSSProperties = {
  width: "56px", height: "56px", background: "#e63946", borderRadius: "14px",
  margin: "0 auto 12px", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "26px", fontWeight: 900, color: "#fff",
};
const btnPrimary: React.CSSProperties = {
  width: "100%", padding: "12px", background: "#e63946", color: "#fff",
  border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "15px", cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 20px", background: "#2e2e2e", color: "#fff",
  border: "none", borderRadius: "10px", fontWeight: 600, fontSize: "14px", cursor: "pointer",
};
const labelStyle: React.CSSProperties = {
  display: "block", color: "#888", fontSize: "13px", fontWeight: 600, marginBottom: "6px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#111", border: "1px solid #444",
  borderRadius: "8px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box",
};
