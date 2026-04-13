"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type IntStatus = { active: boolean; label?: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [address, setAddress] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [sellers, setSellers] = useState<string[]>([]);
  const [newSeller, setNewSeller] = useState("");
  const [plan, setPlan] = useState<string | null>(null);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiName, setAiName] = useState("Paulo");
  const [aiPersonality, setAiPersonality] = useState("");

  const [intStatus, setIntStatus] = useState<Record<string, IntStatus>>({});

  const loadSettings = useCallback(async (uid: string) => {
    const res = await fetch(`/api/settings?userId=${uid}`);
    if (!res.ok) return;
    const d = await res.json();
    setBusinessName(d.business_name ?? "");
    setCnpj(d.cnpj ?? "");
    setStorePhone(d.store_phone ?? "");
    setAddress(d.address ?? "");
    setNotifyPhone(d.notify_phone ?? "");
    setSellers(Array.isArray(d.sellers) ? d.sellers : []);
    setPlan(d.plan ?? null);
    setAiEnabled(d.ai_enabled ?? false);
    setAiName(d.ai_name ?? "Paulo");
    setAiPersonality(d.ai_personality ?? "");
  }, []);

  const loadInt = useCallback(async (uid: string) => {
    try {
      const [u, i] = await Promise.all([
        fetch(`/api/integrations/ultramsg?userId=${uid}`).then(r => r.json()).catch(() => null),
        fetch(`/api/integrations/instagram?userId=${uid}`).then(r => r.json()).catch(() => null),
      ]);
      setIntStatus({
        ultramsg:  { active: u?.active ?? false, label: u?.phone ?? "" },
        instagram: { active: i?.active ?? false, label: i?.username ? `@${i.username}` : "" },
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUserId(user.id);
      await Promise.all([loadSettings(user.id), loadInt(user.id)]);
      setLoading(false);
    })();
  }, [loadSettings, loadInt]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setErro(null);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, business_name: businessName || null,
          cnpj: cnpj || null, store_phone: storePhone || null,
          address: address || null, notify_phone: notifyPhone || null,
          sellers, ai_enabled: aiEnabled,
          ai_name: aiName || "Paulo", ai_personality: aiPersonality || null,
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

  async function handleLogout() { await supabase.auth.signOut(); window.location.href = "/login"; }

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "#111111" }}>
      <p className="text-gray-400">Carregando...</p>
    </main>
  );

  const inp = "w-full px-3 py-2 rounded-xl text-sm border focus:outline-none";
  const inpStyle = { background: "#111", border: "1px solid #3a3a3a", color: "#fff" };

  return (
    <main className="min-h-screen p-6" style={{ background: "#111111" }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black text-white mb-6">Configuracoes</h1>
        <form onSubmit={handleSave} className="space-y-5">
          <Section title="Dados da Loja">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Nome da Loja</label>
                <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                  className={inp} style={inpStyle} placeholder="Minha Loja de Veiculos" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">CNPJ</label>
                  <input value={cnpj} onChange={e => setCnpj(e.target.value)}
                    className={inp} style={inpStyle} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Telefone da Loja</label>
                  <input value={storePhone} onChange={e => setStorePhone(e.target.value)}
                    className={inp} style={inpStyle} placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Endereco</label>
                <input value={address} onChange={e => setAddress(e.target.value)}
                  className={inp} style={inpStyle} placeholder="Rua, numero, bairro, cidade" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Notificacoes WhatsApp</label>
                <input value={notifyPhone} onChange={e => setNotifyPhone(e.target.value)}
                  className={inp} style={inpStyle} placeholder="(11) 99999-9999" />
              </div>
              {plan && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Plano:</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#dc2626", color: "#fff" }}>{plan.toUpperCase()}</span>
                </div>
              )}
            </div>
          </Section>

          <Section title="Equipe de Vendas">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={newSeller} onChange={e => setNewSeller(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSeller())}
                  placeholder="Nome do vendedor" className={`flex-1 ${inp}`} style={inpStyle} />
                <button type="button" onClick={addSeller}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                  style={{ background: "#dc2626" }}>+</button>
              </div>
              {sellers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sellers.map(s => (
                    <span key={s} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
                      style={{ background: "#2e2e2e", color: "#ccc" }}>
                      {s}
                      <button type="button" onClick={() => setSellers(p => p.filter(x => x !== s))}
                        className="ml-1 text-gray-500 hover:text-red-400">✕</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-600">{sellers.length}/15 vendedores</p>
            </div>
          </Section>

          <Section title="Assistente IA">
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setAiEnabled(v => !v)}
                  className="w-10 h-6 rounded-full transition-colors relative"
                  style={{ background: aiEnabled ? "#dc2626" : "#2e2e2e" }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
                    style={{ left: aiEnabled ? "22px" : "4px" }} />
                </div>
                <span className="text-sm text-gray-300">Ativar assistente de atendimento</span>
              </label>
              {aiEnabled && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Nome do Assistente</label>
                    <input value={aiName} onChange={e => setAiName(e.target.value)}
                      className={inp} style={inpStyle} placeholder="Paulo" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Personalidade</label>
                    <textarea value={aiPersonality} onChange={e => setAiPersonality(e.target.value)}
                      rows={3} placeholder="Descreva como o assistente deve se comportar..."
                      className="w-full px-3 py-2 rounded-xl text-sm border focus:outline-none resize-none"
                      style={{ background: "#111", border: "1px solid #3a3a3a", color: "#fff" }} />
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section title="Integracoes Ativas">
            <div className="space-y-3">
              {[
                { key: "ultramsg",  label: "UltraMsg WhatsApp",  href: "/integrations" },
                { key: "instagram", label: "Instagram DM",       href: "/integrations" },
              ].map(({ key, label, href }) => {
                const st = intStatus[key];
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#2e2e2e" }}>
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: st?.active ? "#10b981" : "#3a3a3a" }} />
                      <div>
                        <p className="text-sm text-gray-300">{label}</p>
                        {st?.label && <p className="text-xs text-gray-600">{st.label}</p>}
                      </div>
                    </div>
                    <a href={href} className="text-xs text-red-500 hover:text-red-400 font-semibold">
                      {st?.active ? "Gerenciar" : "Conectar"}
                    </a>
                  </div>
                );
              })}
            </div>
          </Section>

          {erro && <p className="text-xs text-red-400 bg-red-950 px-3 py-2 rounded-xl">{erro}</p>}
          {saved && <p className="text-xs text-green-400 bg-green-950 px-3 py-2 rounded-xl">Configuracoes salvas!</p>}

          <button type="submit" disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#dc2626" }}>
            {saving ? "Salvando..." : "Salvar Configuracoes"}
          </button>
        </form>

        <Section title="Conta">
          <button onClick={handleLogout}
            className="text-sm text-red-500 hover:text-red-400 font-semibold">
            Sair da conta
          </button>
        </Section>
      </div>
    </main>
  );
}
