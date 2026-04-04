"use client";

/**
 * 🔐 Login — CRM 7Business
 *
 * Autenticação de lojistas via Supabase Auth (email + senha).
 * Após login, redireciona para /dashboard?storeId={userId}
 */

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [tab,      setTab]      = useState<"login" | "register">("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [message,  setMessage]  = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("E-mail ou senha incorretos.");
      setLoading(false);
      return;
    }

    // Redireciona para dashboard com storeId = userId do Supabase Auth
    const userId = data.user?.id;
    window.location.href = `/dashboard${userId ? `?storeId=${userId}` : ""}`;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Cria registro na tabela users vinculado ao auth.uid
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("users").upsert({
        id:            userId,
        email,
        business_name: name || null,
      });
    }

    setMessage("✅ Conta criada! Verifique seu e-mail para confirmar o cadastro.");
    setLoading(false);
  }

  return (
    <div style={{
      minHeight:       "100vh",
      background:      "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      fontFamily:      "system-ui, sans-serif",
      padding:         "20px",
    }}>
      <div style={{
        background:   "#1e293b",
        border:       "1px solid #334155",
        borderRadius: "16px",
        padding:      "40px",
        width:        "100%",
        maxWidth:     "420px",
        boxShadow:    "0 25px 50px rgba(0,0,0,0.5)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width:        "56px",
            height:       "56px",
            background:   "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            borderRadius: "14px",
            margin:       "0 auto 12px",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            fontSize:     "24px",
          }}>🚗</div>
          <h1 style={{ color: "#f1f5f9", fontSize: "22px", fontWeight: 700, margin: 0 }}>
            CRM 7Business
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: "4px 0 0" }}>
            Gestão de leads para sua loja
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display:      "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:          "4px",
          background:   "#0f172a",
          borderRadius: "10px",
          padding:      "4px",
          marginBottom: "28px",
        }}>
          {(["login", "register"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(null); setMessage(null); }}
              style={{
                padding:      "8px",
                borderRadius: "8px",
                border:       "none",
                cursor:       "pointer",
                fontWeight:   600,
                fontSize:     "14px",
                transition:   "all .2s",
                background:   tab === t ? "#3b82f6" : "transparent",
                color:        tab === t ? "#fff" : "#94a3b8",
              }}>
              {t === "login" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>

        {/* Mensagem de sucesso */}
        {message && (
          <div style={{
            background:   "#064e3b",
            border:       "1px solid #10b981",
            color:        "#6ee7b7",
            borderRadius: "8px",
            padding:      "12px",
            marginBottom: "20px",
            fontSize:     "14px",
          }}>{message}</div>
        )}

        {/* Erro */}
        {error && (
          <div style={{
            background:   "#450a0a",
            border:       "1px solid #ef4444",
            color:        "#fca5a5",
            borderRadius: "8px",
            padding:      "12px",
            marginBottom: "20px",
            fontSize:     "14px",
          }}>{error}</div>
        )}

        {/* Formulário */}
        <form onSubmit={tab === "login" ? handleLogin : handleRegister}>
          {tab === "register" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Nome da loja</label>
              <input
                type="text"
                placeholder="Ex: PH Autoscar"
                value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>E-mail</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Senha</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width:        "100%",
              padding:      "12px",
              background:   loading ? "#475569" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              color:        "#fff",
              border:       "none",
              borderRadius: "10px",
              fontWeight:   700,
              fontSize:     "15px",
              cursor:       loading ? "not-allowed" : "pointer",
              transition:   "opacity .2s",
            }}>
            {loading ? "Aguarde..." : tab === "login" ? "Entrar no CRM" : "Criar minha conta"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display:      "block",
  color:        "#94a3b8",
  fontSize:     "13px",
  fontWeight:   600,
  marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width:        "100%",
  padding:      "10px 12px",
  background:   "#0f172a",
  border:       "1px solid #334155",
  borderRadius: "8px",
  color:        "#f1f5f9",
  fontSize:     "14px",
  outline:      "none",
  boxSizing:    "border-box",
};
