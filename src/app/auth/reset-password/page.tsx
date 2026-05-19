"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [done,        setDone]        = useState(false);
  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    // Verifica se chegou com sessão válida do link de reset
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidSession(true);
      else setError("Link inválido ou expirado. Solicite um novo link.");
    });
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    if (password.length < 6)  { setError("Senha deve ter no mínimo 6 caracteres."); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => router.push("/"), 2500);
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
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: "#e63946", borderRadius: 14,
            margin: "0 auto 12px", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#fff",
          }}>7</div>
          <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>Nova senha</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>CRM 7Business</p>
        </div>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ color: "#10b981", fontWeight: 700, fontSize: 16 }}>Senha alterada!</p>
            <p style={{ color: "#888", fontSize: 13, marginTop: 8 }}>Redirecionando para o CRM...</p>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ background: "#2a0a0a", border: "1px solid #e63946", color: "#fca5a5",
                borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 14 }}>
                {error}
              </div>
            )}

            {validSession && (
              <form onSubmit={handleReset}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Nova senha</label>
                  <div style={{ position: "relative" }}>
                    <input type={showPass ? "text" : "password"} placeholder="mínimo 6 caracteres"
                      value={password} onChange={e => setPassword(e.target.value)}
                      required minLength={6} style={{ ...inputStyle, paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPass(p => !p)} tabIndex={-1}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", cursor: "pointer", color: "#666" }}>
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Confirmar nova senha</label>
                  <input type={showPass ? "text" : "password"} placeholder="repita a senha"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    required style={inputStyle} />
                </div>
                <button type="submit" disabled={loading || !password || !confirm} style={{
                  width: "100%", padding: 12, background: loading ? "#444" : "#e63946",
                  color: "#fff", border: "none", borderRadius: 10,
                  fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
                }}>
                  {loading ? "Salvando..." : "Salvar nova senha"}
                </button>
              </form>
            )}

            {!validSession && !error && (
              <p style={{ color: "#888", textAlign: "center", fontSize: 14 }}>Verificando link...</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", color: "#888", fontSize: 13, fontWeight: 600, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#111", border: "1px solid #444",
  borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
};
