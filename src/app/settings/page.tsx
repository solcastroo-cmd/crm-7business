"use client";

/**
 * ⚙️ Settings — Configurações da loja
 *
 * Seção 1: Loja (nome + telefone de alerta)
 * Seção 2: Equipe (vendedores — lista dos leads)
 * Seção 3: WhatsApp (status da conexão Evolution)
 * Seção 4: Conta (e-mail + logout)
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Tipos ─────────────────────────────────────────────────────────────────────
type UserSettings = {
  id:            string;
  email:         string;
  business_name: string | null;
  notify_phone:  string | null;
  sellers:       string[] | null;
};

type WAStatus = "checking" | "connected" | "disconnected";

// ── Helper visual ─────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5 mb-4" style={{ background: "#232323", border: "1px solid #2e2e2e" }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
        <span>{icon}</span>{title}
      </h2>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "#1a1a1a",
  border: "1px solid #3a3a3a", borderRadius: "8px", color: "#fff",
  fontSize: "14px", outline: "none", boxSizing: "border-box",
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function SettingsPage() {
  const [userId,   setUserId]   = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);

  // Form state
  const [businessName,  setBusinessName]  = useState("");
  const [notifyPhone,   setNotifyPhone]   = useState("");

  // Equipe: vendedores dos leads
  const [sellers, setSellers] = useState<string[]>([]);
  const [newSeller, setNewSeller] = useState("");

  // WhatsApp status
  const [waStatus, setWaStatus] = useState<WAStatus>("checking");

  // ── Carrega usuário autenticado ─────────────────────────────────────────────
  const loadSettings = useCallback(async (uid: string) => {
    const res = await fetch(`/api/settings?userId=${uid}`);
    if (!res.ok) return;
    const data: UserSettings = await res.json();
    setSettings(data);
    setBusinessName(data.business_name ?? "");
    setNotifyPhone(data.notify_phone  ?? "");
    setSellers(data.sellers ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUserId(user.id);
      await loadSettings(user.id);
      setLoading(false);
    })();
  }, [loadSettings]);

  // ── Verifica status WhatsApp (Evolution API) ────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/evolution/qrcode");
        setWaStatus(res.ok ? "connected" : "disconnected");
      } catch {
        setWaStatus("disconnected");
      }
    };
    check();
  }, []);

  // ── Salva configurações ─────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setErro(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          business_name: businessName || null,
          notify_phone:  notifyPhone  || null,
          sellers,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Adiciona vendedor ───────────────────────────────────────────────────────
  function addSeller() {
    const name = newSeller.trim();
    if (!name || sellers.includes(name) || sellers.length >= 10) return;
    setSellers((prev) => [...prev, name]);
    setNewSeller("");
  }

  function removeSeller(name: string) {
    setSellers((prev) => prev.filter((s) => s !== name));
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <span className="text-gray-500 text-sm animate-pulse">Carregando configurações...</span>
    </div>
  );

  return (
    <main className="min-h-screen p-6 max-w-2xl">

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-xl font-bold text-white">Configurações</h1>
        <p className="text-xs text-gray-500 mt-1">Gerencie sua loja, equipe e integrações.</p>
      </header>

      {erro && (
        <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          {erro}
        </div>
      )}
      {saved && (
        <div className="mb-4 text-sm text-green-400 bg-green-900/20 border border-green-500/30 rounded-lg p-3">
          ✅ Configurações salvas com sucesso!
        </div>
      )}

      <form onSubmit={handleSave}>

        {/* ── Seção 1: Loja ── */}
        <Section title="Loja" icon="🏪">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Nome da loja</label>
              <input type="text" placeholder="Ex: PH Autoscar" value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                style={inp}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">
                Telefone de alerta 🔥 (Lead Quente)
              </label>
              <input type="text" placeholder="5585999998888" value={notifyPhone}
                onChange={(e) => setNotifyPhone(e.target.value)}
                style={inp}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")} />
              <p className="text-[11px] text-gray-600 mt-1">
                Número WhatsApp que recebe alerta quando um lead for qualificado como Quente.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Seção 2: Equipe ── */}
        <Section title="Equipe de Vendas" icon="👥">
          <div className="space-y-3">
            {/* Lista de vendedores */}
            {sellers.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {sellers.map((s) => (
                  <div key={s} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                    style={{ background: "#2a2a2a", border: "1px solid #3a3a3a", color: "#ccc" }}>
                    <span>{s}</span>
                    <button type="button" onClick={() => removeSeller(s)}
                      className="text-gray-600 hover:text-red-400 transition-colors ml-1 leading-none">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600 mb-3">Nenhum vendedor cadastrado.</p>
            )}

            {/* Adicionar vendedor */}
            {sellers.length < 10 && (
              <div className="flex gap-2">
                <input type="text" placeholder="Nome do vendedor" value={newSeller}
                  onChange={(e) => setNewSeller(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSeller())}
                  style={{ ...inp, flex: 1 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#3a3a3a")} />
                <button type="button" onClick={addSeller}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "#e63946", flexShrink: 0 }}>
                  + Adicionar
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-600">{sellers.length}/10 vendedores</p>
          </div>
        </Section>

        {/* Botão salvar */}
        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-sm text-white mb-4 transition-opacity hover:opacity-90"
          style={{ background: saving ? "#555" : "#e63946", cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Salvando..." : "💾 Salvar Configurações"}
        </button>
      </form>

      {/* ── Seção 3: WhatsApp ── */}
      <Section title="WhatsApp" icon="💬">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${
              waStatus === "connected"    ? "bg-green-400" :
              waStatus === "disconnected" ? "bg-red-500" : "bg-yellow-400 animate-pulse"
            }`} />
            <span className="text-sm text-gray-300">
              {waStatus === "connected"    ? "Conectado"     :
               waStatus === "disconnected" ? "Desconectado"  : "Verificando..."}
            </span>
          </div>
          {waStatus === "disconnected" && (
            <a href="/integrations"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#25D366" }}>
              Reconectar
            </a>
          )}
        </div>
      </Section>

      {/* ── Seção 4: Conta ── */}
      <Section title="Conta" icon="👤">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">E-mail</p>
            <p className="text-sm text-gray-300">{settings?.email ?? "—"}</p>
          </div>
          <button onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: "#2a2a2a", border: "1px solid #3a3a3a", color: "#888" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#e63946"; (e.currentTarget as HTMLElement).style.color = "#e63946"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#3a3a3a"; (e.currentTarget as HTMLElement).style.color = "#888"; }}>
            🚪 Sair
          </button>
        </div>
      </Section>

    </main>
  );
}
