"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Kanban CRM 7Business — Plano Pro
// Tema: preto (#1a1a1a) + vermelho (#e63946) + branco
// FEAT-01 : hero dashboard com 4 KPIs, auto-refresh 60s
// FEAT-02 : modal/drawer de perfil completo ao clicar no card
// FEAT-03 : badge Quente/Morno/Frio nos cards do Kanban
// FEAT-04 : botão "Novo Lead" + modal de cadastro manual
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { LeadModal, type Lead } from "@/components/LeadModal";

// ── FEAT-01: tipos e helpers do hero dashboard ───────────────────────────────

type Metrics = {
  leads_ativos:   number;
  leads_hoje:     number;
  leads_ontem:    number;
  taxa_conversao: number;
  tempo_medio_h:  number;
  total_leads:    number;
  total_vendidos: number;
  computed_at:    string;
};

function formatHoras(h: number): string {
  if (h < 1) return "< 1h";
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function calcDelta(hoje: number, ontem: number): string {
  if (ontem === 0) return hoje > 0 ? "+100%" : "—";
  const pct = ((hoje - ontem) / ontem) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%";
}

// ── FEAT-01: Hero Dashboard ──────────────────────────────────────────────────
function HeroDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loadingM, setLoadingM] = useState(true);
  const [erroM, setErroM]       = useState<string | null>(null);

  const fetchMetrics = useCallback(() => {
    fetch("/api/metrics")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: Metrics) => { setMetrics(data); setLoadingM(false); setErroM(null); })
      .catch((e: Error) => { setErroM(e.message); setLoadingM(false); });
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loadingM) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: "#232323" }}>
            <div className="h-3 w-24 bg-white/10 rounded mb-3" />
            <div className="h-8 w-16 bg-white/20 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (erroM || !metrics) {
    return (
      <div className="mb-6 text-xs text-red-400 bg-red-900/20 rounded-lg p-3">
        ⚠️ Métricas indisponíveis: {erroM}
      </div>
    );
  }

  const delta = calcDelta(metrics.leads_hoje, metrics.leads_ontem);
  const deltaPositivo = metrics.leads_hoje >= metrics.leads_ontem;

  const cards = [
    { label: "Leads Ativos",         value: metrics.leads_ativos.toString(),    sub: `${metrics.total_leads} no total`,            icon: "◉", highlight: false },
    { label: "Leads Hoje",           value: metrics.leads_hoje.toString(),       sub: `${delta} vs ontem (${metrics.leads_ontem})`, icon: "↑", highlight: deltaPositivo, subColor: deltaPositivo ? "#4ade80" : "#f87171" },
    { label: "Taxa de Conversão",    value: `${metrics.taxa_conversao}%`,        sub: `${metrics.total_vendidos} vendidos`,         icon: "✓", highlight: metrics.taxa_conversao > 0 },
    { label: "Tempo Médio Resposta", value: formatHoras(metrics.tempo_medio_h), sub: "1ª interação após chegada",                  icon: "⏱", highlight: false },
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl p-4 flex flex-col gap-1 transition-all"
            style={{
              background: "#232323",
              border: card.highlight ? "1px solid #e63946" : "1px solid rgba(255,255,255,0.06)",
            }}>
            <div className="flex items-center gap-1.5">
              <span style={{ color: "#e63946", fontSize: "0.75rem" }}>{card.icon}</span>
              <span className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</span>
            </div>
            <span className="text-2xl font-bold text-white leading-none mt-1">{card.value}</span>
            <span className="text-xs mt-0.5" style={{ color: (card as { subColor?: string }).subColor ?? "#6b7280" }}>{card.sub}</span>
          </div>
        ))}
      </div>
      <p className="text-right text-[10px] text-gray-700 mt-1">
        Atualizado em {new Date(metrics.computed_at).toLocaleTimeString("pt-BR")} · refresh 60s
      </p>
    </div>
  );
}

// ── FEAT-04: Modal de novo lead manual ───────────────────────────────────────
const STAGES = [
  "Novo Lead", "Contato Inicial", "Interesse", "Proposta",
  "Negociação", "VENDIDO!", "Perdido",
];
const SOURCES = ["manual", "whatsapp", "instagram", "facebook", "indicação", "site", "portal"];

type NewLeadForm = { name: string; phone: string; source: string; stage: string; notes: string };

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lead: Lead) => void }) {
  const [form, setForm] = useState<NewLeadForm>({ name: "", phone: "", source: "manual", stage: "Novo Lead", notes: "" });
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.phone.trim()) { setErro("Telefone é obrigatório."); return; }
    setLoading(true); setErro(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone:  form.phone.trim(),
          name:   form.name.trim() || null,
          source: form.source,
          stage:  form.stage,
          notes:  form.notes.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      onCreated(await res.json());
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar lead.");
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px", background: "#1a1a1a",
    border: "1px solid #444", borderRadius: "8px", color: "#fff",
    fontSize: "14px", outline: "none", boxSizing: "border-box",
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: "#232323", border: "1px solid #444" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-white">Novo Lead</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
          </div>
          {erro && <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg p-3">{erro}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Telefone *</label>
              <input type="text" placeholder="55 85 9 9999-8888" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} required style={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Nome</label>
              <input type="text" placeholder="Nome do cliente" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Origem</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                  style={{ ...inp, cursor: "pointer" }}>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Estágio</label>
                <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}
                  style={{ ...inp, cursor: "pointer" }}>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Anotações</label>
              <textarea rows={3} placeholder="Observações iniciais..." value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ ...inp, resize: "none", lineHeight: "1.6" }} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90"
              style={{ background: loading ? "#555" : "#e63946", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Criando..." : "Criar Lead"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Cores das colunas ────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  "Novo Lead":       "border-red-500",
  "Contato Inicial": "border-blue-500",
  "Interesse":       "border-purple-500",
  "Proposta":        "border-teal-400",
  "Negociação":      "border-yellow-400",
  "VENDIDO!":        "border-green-500",
  "Perdido":         "border-gray-600",
};

// FEAT-03: Badge de qualificação para os cards
function QualBadge({ q }: { q?: "quente" | "morno" | "frio" | null }) {
  if (!q) return null;
  const map = {
    quente: { label: "🔥 Quente", cls: "bg-red-500/20 text-red-400" },
    morno:  { label: "⚡ Morno",  cls: "bg-yellow-500/20 text-yellow-400" },
    frio:   { label: "❄️ Frio",   cls: "bg-blue-500/20 text-blue-400" },
  };
  const { label, cls } = map[q];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${cls}`}>{label}</span>;
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [erro, setErro]                 = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showNewLead, setShowNewLead]   = useState(false);

  const [dragOverStage, setDragOverStage]   = useState<string | null>(null);
  const [dragOverLeadId, setDragOverLeadId] = useState<string | null>(null);
  const draggingRef = useRef<Lead | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => { if (!r.ok) throw new Error(`Erro ${r.status}`); return r.json(); })
      .then((data) => { setLeads(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((e) => { setErro(e.message); setLoading(false); });
  }, []);

  const leadsByStage = (stage: string) =>
    leads.filter((l) => l.stage === stage).sort((a, b) => a.position - b.position);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    draggingRef.current = lead;
    e.dataTransfer.effectAllowed = "move";
    (e.currentTarget as HTMLElement).style.opacity = "0.45";
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDragOverStage(null);
    setDragOverLeadId(null);
    draggingRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, stage: string, overLeadId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
    setDragOverLeadId(overLeadId ?? null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string, beforeLeadId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragging = draggingRef.current;
    if (!dragging) return;
    setDragOverStage(null);
    setDragOverLeadId(null);

    const stageLeads = leadsByStage(targetStage).filter((l) => l.id !== dragging.id);
    let newPosition: number;
    if (!beforeLeadId) {
      const last = stageLeads[stageLeads.length - 1];
      newPosition = last ? last.position + 1000 : 0;
    } else {
      const idx  = stageLeads.findIndex((l) => l.id === beforeLeadId);
      const prev = stageLeads[idx - 1];
      const next = stageLeads[idx];
      const lo   = prev ? prev.position : next.position - 2000;
      const hi   = next ? next.position : lo + 2000;
      newPosition = (lo + hi) / 2;
    }

    const snapshot = leads;
    setLeads((prev) => prev.map((l) => l.id === dragging.id ? { ...l, stage: targetStage, position: newPosition } : l));
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dragging.id, stage: targetStage, position: newPosition }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setLeads(snapshot);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <span className="text-gray-400 text-sm animate-pulse">Carregando CRM...</span>
    </div>
  );

  if (erro) return (
    <div className="flex items-center justify-center h-screen flex-col gap-2">
      <span className="text-red-400 text-sm">⚠️ Erro ao carregar leads: {erro}</span>
      <span className="text-gray-600 text-xs">Verifique as variáveis de ambiente do Supabase.</span>
    </div>
  );

  return (
    <main className="min-h-screen p-6">

      {/* ── Header ── */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm"
            style={{ background: "#e63946" }}>7</div>
          <div>
            <h1 className="text-xl font-bold text-white leading-none">CRM 7Business</h1>
            <p className="text-xs text-gray-500 mt-0.5">{leads.length} leads no funil</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* FEAT-04: botão Novo Lead */}
          <button onClick={() => setShowNewLead(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#e63946" }}>
            + Novo Lead
          </button>
          <a href="/integrations" className="text-xs text-gray-500 hover:text-white transition-colors">
            ⚡ Integrações
          </a>
          <span className="text-xs text-gray-500">
            Vendidos: <strong className="text-green-400">{leadsByStage("VENDIDO!").length}</strong>
          </span>
          <span className="text-xs text-gray-500">
            Taxa: <strong style={{ color: "#e63946" }}>
              {leads.length ? ((leadsByStage("VENDIDO!").length / leads.length) * 100).toFixed(1) : 0}%
            </strong>
          </span>
        </div>
      </header>

      {/* ── FEAT-01: Hero Dashboard ── */}
      <HeroDashboard />

      {/* ── Kanban Board ── */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageLeads = leadsByStage(stage);
          const isOver     = dragOverStage === stage;

          return (
            <div key={stage} className="flex-shrink-0 w-64">
              <div
                className={["border-t-2", STAGE_COLORS[stage], "rounded-lg p-3 transition-all duration-150", isOver ? "ring-1 ring-red-500/40" : ""].join(" ")}
                style={{ background: isOver ? "#2a2020" : "#232323" }}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDrop={(e) => handleDrop(e, stage)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{stage}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full text-gray-400" style={{ background: "#2e2e2e" }}>
                    {stageLeads.length}
                  </span>
                </div>

                <div className="space-y-2 min-h-[48px]">
                  {stageLeads.map((lead) => {
                    const isInsertTarget = dragOverLeadId === lead.id && dragOverStage === stage;
                    return (
                      <div key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => { e.stopPropagation(); handleDragOver(e, stage, lead.id); }}
                        onDrop={(e) => { e.stopPropagation(); handleDrop(e, stage, lead.id); }}
                        onClick={() => setSelectedLead(lead)}
                        className={[
                          "rounded-lg p-3 border cursor-grab active:cursor-grabbing",
                          "transition-all duration-100 select-none",
                          isInsertTarget ? "border-red-500 border-t-2 mt-1" : "border-[#333] hover:border-red-500/40",
                        ].join(" ")}
                        style={{ background: "#2a2a2a" }}
                      >
                        <p className="text-sm font-medium text-white truncate">{lead.name || "Sem nome"}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{lead.phone}</p>
                        {/* FEAT-03: source + badge qualificação */}
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-600">{lead.source}</span>
                          <QualBadge q={lead.qualification} />
                        </div>
                      </div>
                    );
                  })}

                  {stageLeads.length === 0 && (
                    <div className={["text-center py-6 text-xs rounded-lg transition-all",
                      isOver ? "text-red-400 bg-red-500/10 border border-dashed border-red-500/30" : "text-gray-700"].join(" ")}>
                      {isOver ? "Solte aqui" : "vazio"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FEAT-02: Modal/Drawer de perfil ── */}
      <LeadModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={(updated) => {
          setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
          setSelectedLead(updated);
        }}
      />

      {/* ── FEAT-04: Modal novo lead manual ── */}
      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onCreated={(lead) => setLeads((prev) => [lead, ...prev])}
        />
      )}
    </main>
  );
}
