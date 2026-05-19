"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [tab,         setTab]         = useState<"login" | "register">("login");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [name,        setName]        = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [message,     setMessage]     = useState<string | null>(null);

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
    setMessage("✅ Conta criada! Verifique seu e-mail para confirmar.");
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#1a1a1a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Segoe UI, sans-serif", padding: "20px",
    }}>
      <div style={{
        background: "#232323", border: "1px solid #333", borderRadius: "18px",
        padding: "40px", width: "100%", maxWidth: "420px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "56px", height: "56px", background: "#e63946", borderRadius: "14px",
            margin: "0 auto 12px", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "26px", fontWeight: 900, color: "#fff",
          }}>7</div>
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
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Senha</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required minLength={6}
                style={{ ...inputStyle, paddingRight: "44px" }}
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "#666", fontSize: "16px", padding: "2px",
                  display: "flex", alignItems: "center",
                }}
                tabIndex={-1}
                title={showPass ? "Ocultar senha" : "Ver senha"}
              >
                {showPass ? (
                  /* olho aberto */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  /* olho fechado */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px",
            background: loading ? "#444" : "#e63946",
            color: "#fff", border: "none", borderRadius: "10px",
            fontWeight: 700, fontSize: "15px",
            cursor: loading ? "not-allowed" : "pointer", transition: "opacity .2s",
          }}>
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

const labelStyle: React.CSSProperties = {
  display: "block", color: "#888", fontSize: "13px",
  fontWeight: 600, marginBottom: "6px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  background: "#111", border: "1px solid #444",
  borderRadius: "8px", color: "#fff",
  fontSize: "14px", outline: "none", boxSizing: "border-box",
};
