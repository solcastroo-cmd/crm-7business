"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Kanban CRM 7Business — Plano Pro
// Tema: light (#f0f2f5 bg) + branco cards + vermelho accent
// FEAT-01 : hero dashboard com 4 KPIs, auto-refresh 60s
// FEAT-02 : modal/drawer de perfil completo ao clicar no card
// FEAT-03 : badge Quente/Morno/Frio nos cards do Kanban
// FEAT-04 : botão "Novo Lead" + modal de cadastro manual
// FEAT-05 : busca + filtros no Kanban
// FEAT-06 : dashboard analytics com gráficos (recharts)
// BUG-02  : multi-tenant via supabase.auth.getUser() → storeId
// REDESIGN: visual light profissional matching screenshots
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { LeadModal, type Lead } from "@/components/LeadModal";
import { DashboardCharts } from "@/components/DashboardCharts";
import { useUserId } from "@/hooks/useUserId";

// ── Supabase client (browser) ────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Stage config ─────────────────────────────────────────────────────────────
const STAGES = [
  "Novo Lead", "Contato Inicial", "Interesse", "Proposta",
  "Negociação", "VENDIDO!", "Perdido",
];

const STAGE_COLOR: Record<string, string> = {
  "Novo Lead":       "#ef4444",
  "Contato Inicial": "#3b82f6",
  "Interesse":       "#8b5cf6",
  "Proposta":        "#14b8a6",
  "Negociação":      "#f59e0b",
  "VENDIDO!":        "#22c55e",
  "Perdido":         "#6b7280",
};

const SOURCES = ["manual", "whatsapp", "instagram", "facebook", "indicação", "site", "portal"];

// ── Source icon map ───────────────────────────────────────────────────────────
const SOURCE_ICON: Record<string, { icon: string; color: string }> = {
  "whatsapp_evolution": { icon: "W", color: "#25D366" },
  "whatsapp":           { icon: "W", color: "#25D366" },
  "instagram":          { icon: "I", color: "#e1306c" },
  "facebook":           { icon: "F", color: "#1877f2" },
  "manual":             { icon: "M", color: "#6b7280" },
  "site":               { icon: "S", color: "#8b5cf6" },
  "portal":             { icon: "P", color: "#f59e0b" },
  "indicação":          { icon: "R", color: "#14b8a6" },
};

// ── Avatar palette ────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#e63946", "#3b82f6", "#8b5cf6", "#f59e0b",
  "#14b8a6", "#22c55e", "#f97316", "#ec4899",
];

function avatarColor(name: string | null): string {
  if (!name) return "#6b7280";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function avatarInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Time elapsed ──────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return `há ${Math.floor(d / 30)}M`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeStr(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

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

// ── Metrics type ──────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// FEAT-01: Hero Dashboard — white cards, red accent
// ─────────────────────────────────────────────────────────────────────────────
function HeroDashboard({ storeId }: { storeId: string | null }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loadingM, setLoadingM] = useState(true);
  const [erroM, setErroM]       = useState<string | null>(null);

  const fetchMetrics = useCallback(() => {
    const url = storeId ? `/api/metrics?storeId=${storeId}` : "/api/metrics";
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: Metrics) => { setMetrics(data); setLoadingM(false); setErroM(null); })
      .catch((e: Error) => { setErroM(e.message); setLoadingM(false); });
  }, [storeId]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loadingM) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl p-5 animate-pulse"
            style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
            <div className="h-3 w-20 rounded mb-3" style={{ background: "#f0f2f5" }} />
            <div className="h-8 w-16 rounded" style={{ background: "#f0f2f5" }} />
          </div>
        ))}
      </div>
    );
  }

  if (erroM || !metrics) {
    return (
      <div className="mb-6 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
        Métricas indisponíveis: {erroM}
      </div>
    );
  }

  const delta         = calcDelta(metrics.leads_hoje, metrics.leads_ontem);
  const deltaPositivo = metrics.leads_hoje >= metrics.leads_ontem;

  const cards = [
    {
      label: "Leads Ativos",
      value: metrics.leads_ativos.toString(),
      icon: "◉",
      sub1: { label: "Total", val: metrics.total_leads.toString(), color: "#6b7280" },
      sub2: null,
      accent: false,
    },
    {
      label: "Leads Hoje",
      value: metrics.leads_hoje.toString(),
      icon: "↑",
      sub1: { label: "Ontem", val: metrics.leads_ontem.toString(), color: "#6b7280" },
      sub2: { label: delta, val: "", color: deltaPositivo ? "#22c55e" : "#ef4444" },
      accent: deltaPositivo,
    },
    {
      label: "Taxa de Conversão",
      value: `${metrics.taxa_conversao}%`,
      icon: "✓",
      sub1: { label: "Vendidos", val: metrics.total_vendidos.toString(), color: "#22c55e" },
      sub2: null,
      accent: metrics.taxa_conversao > 0,
    },
    {
      label: "Tempo Médio Resposta",
      value: formatHoras(metrics.tempo_medio_h),
      icon: "⏱",
      sub1: { label: "1ª interação após chegada", val: "", color: "#6b7280" },
      sub2: null,
      accent: false,
    },
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label}
            className="rounded-xl p-5 flex flex-col gap-1 transition-all"
            style={{
              background: "#fff",
              border: card.accent ? "1px solid #fca5a5" : "1px solid #e8e8e8",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ color: "#e63946", fontSize: "0.7rem" }}>{card.icon}</span>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                {card.label}
              </span>
            </div>
            <span className="text-3xl font-bold leading-none" style={{ color: "#1a1a1a" }}>
              {card.value}
            </span>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {card.sub1 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "#f0f2f5", color: card.sub1.color }}>
                  {card.sub1.label}{card.sub1.val ? `: ${card.sub1.val}` : ""}
                </span>
              )}
              {card.sub2 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{
                    background: deltaPositivo ? "#dcfce7" : "#fee2e2",
                    color: card.sub2.color,
                  }}>
                  {card.sub2.label}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-right text-[10px] mt-1" style={{ color: "#d1d5db" }}>
        Atualizado em {new Date(metrics.computed_at).toLocaleTimeString("pt-BR")} · refresh 60s
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FEAT-04: Modal de novo lead manual — dark overlay style preserved
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Kanban Card — redesigned white bg, matching screenshot
// ─────────────────────────────────────────────────────────────────────────────
const QUAL_CONFIG = {
  quente: { label: "LEAD QUENTE", bg: "#fee2e2", color: "#dc2626", border: "#dc2626" },
  morno:  { label: "MORNO",       bg: "#fef3c7", color: "#d97706", border: "#d97706" },
  frio:   { label: "FRIO",        bg: "#dbeafe", color: "#2563eb", border: "#2563eb" },
};

function KanbanCard({
  lead,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onClick,
  onDelete,
}: {
  lead: Lead;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const qual    = lead.qualification ? QUAL_CONFIG[lead.qualification] : null;
  const src     = SOURCE_ICON[lead.source] ?? { icon: lead.source?.[0]?.toUpperCase() ?? "?", color: "#6b7280" };
  const bgColor = avatarColor(lead.name);
  const initials = avatarInitials(lead.name);
  const borderLeft = qual?.border ?? "#e5e7eb";

  async function handleConfirmDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDel(true);
    // auto-cancela após 3s sem confirmação
    setTimeout(() => setConfirmDel(false), 3000);
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDel(false);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.stopPropagation(); onDragOver(e); }}
      onDrop={(e)     => { e.stopPropagation(); onDrop(e); }}
      onClick={onClick}
      style={{
        background: "#fff",
        border: isDragOver ? "1.5px solid #e63946" : "1px solid #e5e7eb",
        borderLeft: `3px solid ${borderLeft}`,
        borderRadius: "10px",
        boxShadow: isDragOver
          ? "0 4px 16px rgba(230,57,70,0.15)"
          : "0 1px 3px rgba(0,0,0,0.08)",
        padding: "12px 12px 10px",
        cursor: "grab",
        userSelect: "none",
        transition: "box-shadow 0.1s, border-color 0.1s",
        marginTop: isDragOver ? "4px" : "0",
        position: "relative",
      }}
      className="active:cursor-grabbing hover:shadow-md group"
    >
      {/* Botão excluir — aparece no hover */}
      {!confirmDel ? (
        <button
          onClick={handleDeleteClick}
          title="Excluir lead"
          style={{
            position: "absolute", top: "8px", right: "8px",
            width: "20px", height: "20px", borderRadius: "4px",
            background: "transparent", border: "none",
            cursor: "pointer", fontSize: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#d1d5db", transition: "color 0.15s, background 0.15s",
            opacity: 0,
          }}
          className="group-hover:opacity-100 hover:!text-red-500 hover:!bg-red-50"
        >
          🗑
        </button>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "6px", right: "6px",
            display: "flex", alignItems: "center", gap: "4px",
            background: "#fff", border: "1px solid #fca5a5",
            borderRadius: "6px", padding: "2px 5px",
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: "10px", color: "#ef4444", fontWeight: 600, whiteSpace: "nowrap" }}>
            {deleting ? "..." : "Excluir?"}
          </span>
          <button
            onClick={handleConfirmDelete}
            disabled={deleting}
            style={{
              background: "#ef4444", color: "#fff", border: "none",
              borderRadius: "4px", padding: "1px 6px",
              fontSize: "10px", fontWeight: 700, cursor: "pointer",
            }}
          >
            Sim
          </button>
          <button
            onClick={handleCancelDelete}
            style={{
              background: "#f3f4f6", color: "#6b7280", border: "none",
              borderRadius: "4px", padding: "1px 6px",
              fontSize: "10px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Não
          </button>
        </div>
      )}

      {/* Row 1: Avatar + Name + Time */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
        <div style={{
          width: "32px", height: "32px", borderRadius: "50%",
          background: bgColor, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", fontWeight: 700, color: "#fff",
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
            <span style={{
              fontWeight: 700, fontSize: "13px", color: "#111827",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              flex: 1,
            }}>
              {lead.name || "Sem nome"}
            </span>
            <span style={{ fontSize: "10px", color: "#9ca3af", flexShrink: 0, marginLeft: "24px" }}>
              {timeAgo(lead.created_at)}
            </span>
          </div>
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>{lead.phone}</span>
        </div>
      </div>

      {/* Row 2: Source icon + label */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "7px" }}>
        <div style={{
          width: "18px", height: "18px", borderRadius: "50%",
          background: src.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "9px", fontWeight: 800, color: "#fff", flexShrink: 0,
        }}>
          {src.icon}
        </div>
        <span style={{ fontSize: "11px", color: "#6b7280" }}>{lead.source}</span>
      </div>

      {/* Row 3: Qual badge + Tags */}
      {(qual || (lead.tags && lead.tags.length > 0)) && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px", flexWrap: "wrap" }}>
          {qual && (
            <span style={{
              fontSize: "9px", fontWeight: 700, padding: "2px 7px",
              borderRadius: "999px", background: qual.bg, color: qual.color,
              border: `1px solid ${qual.border}`,
              letterSpacing: "0.04em",
            }}>
              {qual.label}
            </span>
          )}
          {lead.tags?.map((tag) => (
            <span key={tag} style={{
              fontSize: "9px", padding: "2px 6px", borderRadius: "999px",
              background: "#f3f4f6", color: "#6b7280",
              border: "1px solid #e5e7eb",
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Row 4: Seller (bottom right) */}
      {lead.seller && (
        <div style={{ textAlign: "right", marginTop: "2px" }}>
          <span style={{ fontSize: "10px", color: "#c4c7cc" }}>{lead.seller}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [erro, setErro]                 = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showNewLead, setShowNewLead]   = useState(false);

  const { userId } = useUserId();

  // FEAT-05: busca + filtros
  const [searchTerm,          setSearchTerm]          = useState("");
  const [qualificationFilter, setQualificationFilter] = useState("Todos");
  const [sellerFilter,        setSellerFilter]         = useState("Todos");

  const [dragOverStage,  setDragOverStage]  = useState<string | null>(null);
  const [dragOverLeadId, setDragOverLeadId] = useState<string | null>(null);
  const draggingRef = useRef<Lead | null>(null);
  const refreshRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const boardRef    = useRef<HTMLDivElement>(null);

  // Auto-scroll: rola coluna (vertical) e board (horizontal) durante drag
  const autoScroll = (e: React.DragEvent) => {
    const ZONE  = 80;   // px da borda que ativa o scroll
    const SPEED = 10;   // px por evento

    // Scroll vertical — encontra o container da coluna com data-scroll
    let el: HTMLElement | null = e.target as HTMLElement;
    while (el && !el.dataset.scroll) el = el.parentElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (e.clientY - rect.top  < ZONE) el.scrollTop -= SPEED;
      if (rect.bottom - e.clientY < ZONE) el.scrollTop += SPEED;
    }

    // Scroll horizontal — board
    const board = boardRef.current;
    if (board) {
      const rect = board.getBoundingClientRect();
      if (e.clientX - rect.left  < 120) board.scrollLeft -= SPEED;
      if (rect.right - e.clientX < 120) board.scrollLeft += SPEED;
    }
  };

  const fetchLeads = useCallback(() => {
    if (!userId) return;
    fetch(`/api/leads?storeId=${userId}`)
      .then((r) => { if (!r.ok) throw new Error(`Erro ${r.status}`); return r.json(); })
      .then((data) => { setLeads(Array.isArray(data) ? data : []); setLoading(false); setErro(null); })
      .catch((e) => { setErro(e.message); setLoading(false); });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchLeads();
    refreshRef.current = setInterval(fetchLeads, 30_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchLeads, userId]);

  const sellers = useMemo(() =>
    ["Todos", ...Array.from(new Set(leads.map((l) => l.seller).filter(Boolean) as string[]))],
    [leads]
  );

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (qualificationFilter !== "Todos")
      result = result.filter((l) => l.qualification === qualificationFilter);
    if (sellerFilter !== "Todos")
      result = result.filter((l) => l.seller === sellerFilter);
    if (searchTerm.trim()) {
      const q = normalizeStr(searchTerm.trim());
      result = result.filter((l) =>
        normalizeStr(l.name ?? "").includes(q) ||
        normalizeStr(l.phone).includes(q) ||
        normalizeStr(l.source).includes(q)
      );
    }
    return result;
  }, [leads, qualificationFilter, sellerFilter, searchTerm]);

  const isFilterActive = qualificationFilter !== "Todos" || sellerFilter !== "Todos" || searchTerm !== "";
  const clearFilters   = () => { setSearchTerm(""); setQualificationFilter("Todos"); setSellerFilter("Todos"); };

  const leadsByStage = (stage: string) =>
    filteredLeads.filter((l) => l.stage === stage).sort((a, b) => a.position - b.position);

  // ── Delete lead ──
  const handleDeleteLead = useCallback(async (id: string) => {
    // Optimistic update — remove imediatamente da UI
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
    } catch {
      // Se falhar, recarrega do servidor
      fetchLeads();
    }
  }, [fetchLeads]);

  // ── Drag & drop handlers ──
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
    autoScroll(e);
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f0f2f5" }}>
      <span style={{ color: "#9ca3af", fontSize: "14px" }}>Carregando CRM...</span>
    </div>
  );

  if (erro) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: "8px", background: "#f0f2f5" }}>
      <span style={{ color: "#ef4444", fontSize: "14px" }}>Erro ao carregar leads: {erro}</span>
      <span style={{ color: "#9ca3af", fontSize: "12px" }}>Verifique as variáveis de ambiente do Supabase.</span>
    </div>
  );

  const totalVendidos = leads.filter((l) => l.stage === "VENDIDO!").length;
  const taxaConversao = leads.length ? ((totalVendidos / leads.length) * 100).toFixed(1) : "0";

  return (
    <main style={{ minHeight: "100vh", background: "#f0f2f5", padding: "24px" }}>

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "24px", flexWrap: "wrap", gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "#e63946", display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "16px",
            boxShadow: "0 2px 8px rgba(230,57,70,0.35)",
          }}>7</div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#111827", lineHeight: 1 }}>
              CRM 7Business
            </h1>
            <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>
              {leads.length} leads no funil
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowNewLead(true)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "8px", border: "none",
              background: "#e63946", color: "#fff", fontSize: "13px",
              fontWeight: 700, cursor: "pointer",
              boxShadow: "0 2px 6px rgba(230,57,70,0.3)",
            }}>
            + Novo Lead
          </button>
          <a href="/integrations"
            style={{ fontSize: "12px", color: "#6b7280", textDecoration: "none" }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#e63946")}
            onMouseOut={(e)  => (e.currentTarget.style.color = "#6b7280")}>
            Integrações
          </a>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Vendidos:{" "}
            <strong style={{ color: "#22c55e" }}>{totalVendidos}</strong>
          </span>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Taxa:{" "}
            <strong style={{ color: "#e63946" }}>{taxaConversao}%</strong>
          </span>
        </div>
      </header>

      {/* ── FEAT-01: Hero Dashboard ── */}
      <HeroDashboard storeId={userId} />

      {/* ── FEAT-06: Dashboard Analytics ── */}
      <DashboardCharts leads={leads} />

      {/* ── FEAT-05: Filter Bar ── */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px",
        padding: "14px 16px", marginBottom: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        {/* Search input */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <span style={{
            position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
            color: "#d1d5db", fontSize: "13px", pointerEvents: "none",
          }}>
            &#x1F50D;
          </span>
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou origem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%", padding: "9px 32px 9px 36px",
              border: "1px solid #e5e7eb", borderRadius: "8px",
              fontSize: "13px", color: "#374151", outline: "none",
              background: "#f9fafb", boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e)  => (e.currentTarget.style.borderColor = "#e63946")}
            onBlur={(e)   => (e.currentTarget.style.borderColor = "#e5e7eb")}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{
                position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "#9ca3af",
                fontSize: "12px", padding: "0",
              }}>
              ✕
            </button>
          )}
        </div>

        {/* Filter pills + seller + counter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {[
            { val: "Todos",  label: "Todos"      },
            { val: "quente", label: "Quente"      },
            { val: "morno",  label: "Morno"       },
            { val: "frio",   label: "Frio"        },
          ].map(({ val, label }) => {
            const isActive = qualificationFilter === val;
            return (
              <button
                key={val}
                onClick={() => setQualificationFilter(val)}
                style={{
                  padding: "5px 14px", borderRadius: "999px", fontSize: "12px",
                  fontWeight: 600, cursor: "pointer", border: "1px solid",
                  borderColor: isActive ? "#e63946" : "#e5e7eb",
                  color:       isActive ? "#e63946" : "#6b7280",
                  background:  isActive ? "#fff1f2" : "#fff",
                  transition: "all 0.15s",
                }}>
                {label}
              </button>
            );
          })}

          {/* Seller dropdown */}
          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            style={{
              padding: "5px 14px", borderRadius: "999px", fontSize: "12px",
              fontWeight: 600, cursor: "pointer", border: "1px solid",
              borderColor: sellerFilter !== "Todos" ? "#e63946" : "#e5e7eb",
              color:       sellerFilter !== "Todos" ? "#e63946" : "#6b7280",
              background:  sellerFilter !== "Todos" ? "#fff1f2" : "#fff",
              outline: "none",
            }}>
            {sellers.map((s) => (
              <option key={s} value={s}>{s === "Todos" ? "Vendedor" : s}</option>
            ))}
          </select>

          {/* Counter + clear */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
            {isFilterActive && (
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                {filteredLeads.length === leads.length
                  ? `${leads.length} leads`
                  : `${filteredLeads.length} de ${leads.length} leads`}
              </span>
            )}
            {isFilterActive && (
              <button
                onClick={clearFilters}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: 600, color: "#e63946", padding: 0,
                }}>
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {isFilterActive && filteredLeads.length === 0 && (
          <p style={{ textAlign: "center", fontSize: "12px", color: "#9ca3af", marginTop: "12px" }}>
            Nenhum lead encontrado{searchTerm ? ` para "${searchTerm}"` : ""}.
          </p>
        )}
      </div>

      {/* ── Kanban Board ── */}
      <div ref={boardRef} id="kanban-board" style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "16px" }}>
        {STAGES.map((stage) => {
          const stageLeads = leadsByStage(stage);
          const isOver     = dragOverStage === stage;
          const stageColor = STAGE_COLOR[stage];

          return (
            <div key={stage} style={{ flexShrink: 0, width: "268px" }}>
              {/* Column container */}
              <div
                style={{
                  background:   isOver ? "#fafafa" : "#f8f8f8",
                  borderRadius: "12px",
                  border:       isOver ? `1px solid ${stageColor}40` : "1px solid #e5e7eb",
                  boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
                  overflow:     "hidden",
                  transition:   "all 0.15s",
                  display:      "flex",
                  flexDirection:"column",
                  maxHeight:    "calc(100vh - 260px)",
                }}>

                {/* Column top color bar */}
                <div style={{
                  height: "3px",
                  background: stageColor,
                  borderRadius: "12px 12px 0 0",
                  flexShrink: 0,
                }} />

                {/* Column header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 12px 8px", flexShrink: 0,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <div style={{
                      width: "9px", height: "9px", borderRadius: "50%",
                      background: stageColor, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>
                      {stage}
                    </span>
                  </div>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, color: "#9ca3af",
                    background: "#fff", border: "1px solid #e5e7eb",
                    padding: "1px 8px", borderRadius: "999px",
                  }}>
                    {stageLeads.length}
                  </span>
                </div>

                {/* Cards — scrollável com auto-scroll durante drag */}
                <div
                  data-scroll="true"
                  onDragOver={(e) => handleDragOver(e, stage)}
                  onDrop={(e) => handleDrop(e, stage)}
                  style={{
                    padding: "0 10px 10px", minHeight: "60px",
                    display: "flex", flexDirection: "column", gap: "8px",
                    overflowY: "auto", flex: 1,
                    scrollbarWidth: "thin",
                    scrollbarColor: "#e5e7eb transparent",
                  }}>
                  {stageLeads.map((lead) => {
                    const isDragOver = dragOverLeadId === lead.id && dragOverStage === stage;
                    return (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        isDragOver={isDragOver}
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, stage, lead.id)}
                        onDrop={(e) => handleDrop(e, stage, lead.id)}
                        onClick={() => setSelectedLead(lead)}
                        onDelete={() => handleDeleteLead(lead.id)}
                      />
                    );
                  })}

                  {stageLeads.length === 0 && (
                    <div style={{
                      textAlign: "center", padding: "24px 8px",
                      fontSize: "11px", borderRadius: "8px",
                      color:      isOver ? stageColor : "#d1d5db",
                      background: isOver ? `${stageColor}0d` : "transparent",
                      border:     isOver ? `1px dashed ${stageColor}80` : "1px dashed transparent",
                      transition: "all 0.15s",
                    }}>
                      {isOver ? "Solte aqui" : "vazio"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FEAT-02: Lead profile modal ── */}
      <LeadModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={(updated) => {
          setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
          setSelectedLead(updated);
        }}
      />

      {/* ── FEAT-04: New lead modal ── */}
      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onCreated={(lead) => setLeads((prev) => [lead, ...prev])}
        />
      )}
    </main>
  );
}
