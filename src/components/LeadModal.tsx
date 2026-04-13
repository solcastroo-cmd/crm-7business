"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FEAT-02: LeadModal — drawer lateral com perfil completo do lead
//
// Funcionalidades:
//   • Perfil: nome, telefone, source, estágio, orçamento, tipo, pagamento, vendedor
//   • Botão "Abrir WhatsApp" com número pré-preenchido (wa.me)
//   • Textarea de anotações com auto-save debounced (800ms) via PATCH /api/leads
//   • Histórico simplificado: created_at + updated_at com timestamp
//   • Responsivo: drawer full em mobile, max-w-md em desktop
//   • Fecha ao clicar no backdrop ou no botão ✕
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";

// ── Tipo Lead com todos os campos opcionais do perfil ────────────────────────
export type Lead = {
  id: string;
  phone: string;
  name: string | null;
  stage: string;
  source: string;
  position: number;
  created_at: string;
  updated_at?: string;    // preenchido pelo trigger do banco
  budget?: string | null;  // orçamento
  type?: string | null;    // tipo de veículo (ex: "SUV", "Sedan")
  payment?: string | null; // forma de pagamento (ex: "Financiamento", "À vista")
  seller?: string | null;  // vendedor responsável
  notes?: string | null;   // anotações livres, salvas via PATCH
  qualification?: "quente" | "morno" | "frio" | null; // qualificação IA
  tags?: string[] | null;  // tags personalizadas
  ai_enabled?: boolean;    // true = Paulo ativo | false = vendedor humano assumiu
};

type Props = {
  lead: Lead | null;
  onClose: () => void;
  onUpdate: (updated: Lead) => void; // callback para atualizar o estado do Kanban
};

// Badge de cor por estágio — mesma paleta do Kanban
const STAGE_BADGE: Record<string, string> = {
  "Novo Lead":       "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Contato Inicial": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Interesse":       "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Proposta":        "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "Negociação":      "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "VENDIDO!":        "bg-green-500/20 text-green-300 border-green-500/30",
  "Perdido":         "bg-red-500/20 text-red-300 border-red-500/30",
};

/** Formata uma data ISO para pt-BR legível */
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Campo de perfil: label em cinza + valor em branco */
function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span className="text-sm text-gray-200">{value || "—"}</span>
    </div>
  );
}

// ── Tipo mensagem ─────────────────────────────────────────────────────────────
type Message = {
  id:         string;
  text:       string;
  from_me:    boolean;
  created_at: string;
};

// ── Componente principal ─────────────────────────────────────────────────────
export function LeadModal({ lead, onClose, onUpdate }: Props) {
  const [notes, setNotes]             = useState(lead?.notes ?? "");
  const [saving, setSaving]           = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [tags, setTags]               = useState<string[]>(lead?.tags ?? []);
  const [tagInput, setTagInput]       = useState("");
  const [aiEnabled, setAiEnabled]     = useState<boolean>(lead?.ai_enabled !== false);
  const [togglingAi, setTogglingAi]   = useState(false);
  const [replyText, setReplyText]     = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza anotações, tags, ai_enabled e carrega mensagens quando troca de lead
  useEffect(() => {
    setNotes(lead?.notes ?? "");
    setTags(lead?.tags ?? []);
    setAiEnabled(lead?.ai_enabled !== false);
  }, [lead?.id]);

  /** Ativa / desativa Paulo (IA) para este lead */
  async function toggleAI() {
    if (!lead || togglingAi) return;
    setTogglingAi(true);
    const next = !aiEnabled;
    const res = await fetch(`/api/leads/ai-toggle?leadId=${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_enabled: next }),
    });
    if (res.ok) {
      setAiEnabled(next);
      onUpdate({ ...lead, ai_enabled: next });
    }
    setTogglingAi(false);
  }

  /** Vendedor envia mensagem manualmente pelo CRM → Paulo para automaticamente */
  async function sendReply() {
    if (!lead || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, text: replyText.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      // Adiciona mensagem ao chat local imediatamente
      if (data.message) setMessages((prev) => [...prev, data.message]);
      setReplyText("");
      // Atualiza ai_enabled no estado pai (Paulo foi desativado)
      setAiEnabled(false);
      onUpdate({ ...lead, ai_enabled: false });
      // Scroll ao fim
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    setSendingReply(false);
  }

  async function saveTags(newTags: string[]) {
    if (!lead) return;
    setTags(newTags);
    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, tags: newTags }),
    });
    if (res.ok) onUpdate(await res.json());
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || tags.includes(t) || tags.length >= 8) return;
    const newTags = [...tags, t];
    setTagInput("");
    saveTags(newTags);
  }

  function removeTag(t: string) {
    saveTags(tags.filter((x) => x !== t));
  }

  const fetchMessages = useCallback(async (leadId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/messages?leadId=${leadId}`);
      if (res.ok) setMessages(await res.json());
    } catch { /* silencia */ }
    finally { setLoadingMsgs(false); }
  }, []);

  useEffect(() => {
    if (lead?.id) {
      setMessages([]);
      fetchMessages(lead.id);
    }
  }, [lead?.id, fetchMessages]);

  // Scroll automático para última mensagem
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fecha o modal com tecla Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lead) return null;

  // Sanitiza número para wa.me (apenas dígitos, sem espaços/hífens)
  const waNumber = lead.phone.replace(/\D/g, "");
  const waUrl    = `https://wa.me/${waNumber}`;

  // ── Auto-save com debounce de 800ms ─────────────────────────────────────
  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch("/api/leads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: lead.id, notes: val }),
        });
        if (res.ok) {
          const updated: Lead = await res.json();
          onUpdate(updated);
        }
      } catch {
        // silencia — o usuário não perde o texto digitado, só não foi salvo
      } finally {
        setSaving(false);
      }
    }, 800);
  };

  return (
    <>
      {/* ── Backdrop translúcido — fecha ao clicar fora ─────────────────── */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Drawer lateral ──────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label={`Perfil de ${lead.name || lead.phone}`}
        className="fixed right-0 top-0 h-full w-full max-w-md z-50
                   flex flex-col overflow-y-auto overflow-x-hidden"
        style={{
          background:  "#0f1117",
          borderLeft:  "1px solid rgba(255,255,255,0.07)",
          boxShadow:   "-8px 0 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* ── Header fixo ───────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-10 flex items-start justify-between p-5
                     border-b border-white/5"
          style={{ background: "#0f1117" }}
        >
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-lg font-bold text-white truncate leading-tight">
              {lead.name || "Sem nome"}
            </h2>
            <p className="text-sm text-gray-400 truncate mt-0.5">{lead.phone}</p>
            {/* Badges: estágio + qualification */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`inline-block text-xs px-2.5 py-0.5 rounded-full
                            font-medium border ${STAGE_BADGE[lead.stage] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}
              >
                {lead.stage}
              </span>
              {lead.qualification && (
                <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  lead.qualification === "quente"
                    ? "bg-red-500/20 text-red-400 border border-red-500/40"
                    : lead.qualification === "morno"
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                }`}>
                  {lead.qualification === "quente" ? "🔥 Quente"
                    : lead.qualification === "morno" ? "⚡ Morno"
                    : "❄️ Frio"}
                </span>
              )}
            </div>
          </div>
          {/* Botão fechar */}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-gray-500 hover:text-white transition-colors text-xl
                       leading-none flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* ── Conteúdo rolável ──────────────────────────────────────────── */}
        <div className="flex-1 p-5 space-y-7">

          {/* ── Seção: Perfil ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-2">Perfil do Lead</h3>
            <div
              className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl p-4 border"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <Field label="Origem"            value={lead.source} />
              <Field label="Orçamento"         value={lead.budget} />
              <Field label="Tipo de Veículo"   value={lead.type} />
              <Field label="Forma de Pagamento" value={lead.payment} />
              {/* Vendedor ocupa linha inteira quando presente */}
              <div className="col-span-2">
                <Field label="Vendedor" value={lead.seller} />
              </div>
            </div>
          </section>

          {/* ── Botão WhatsApp ────────────────────────────────────────── */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                       font-semibold text-sm text-white transition-opacity hover:opacity-90
                       active:opacity-80"
            style={{ background: "#25D366" }}
          >
            {/* Ícone WhatsApp SVG inline — sem dependência de ícone */}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Abrir WhatsApp — {lead.phone}
          </a>

          {/* ── Seção: Anotações ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-2">Anotações</h3>
              {/* Indicador de auto-save */}
              <span className={`text-[10px] transition-opacity duration-300 ${saving ? "opacity-100 text-gray-500" : "opacity-0"}`}>
                Salvando...
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Adicione observações sobre este lead: interesses, objeções, próximos passos..."
              rows={5}
              className="w-full rounded-xl p-3 text-sm text-gray-200 resize-none
                         outline-none transition-colors placeholder-gray-600"
              style={{
                background:   "#1a1d27",
                border:       "1px solid rgba(255,255,255,0.08)",
                lineHeight:   "1.65",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            />
          </section>

          {/* ── Seção: Tags ──────────────────────────────────────── */}
          <section>
            <h3 className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-2">🏷️ Tags</h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: "#e63946", color: "#fff" }}>
                  {t}
                  <button onClick={() => removeTag(t)} className="opacity-70 hover:opacity-100 leading-none ml-0.5">✕</button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-xs text-gray-600">Nenhuma tag.</span>}
            </div>
            {tags.length < 8 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="nova-tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                  style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", color: "#fff" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                />
                <button onClick={addTag}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ background: "#e63946" }}>
                  + Add
                </button>
              </div>
            )}
          </section>

          {/* ── Seção: Conversa WhatsApp ─────────────────────────── */}
          <section>
            {/* Header com toggle IA */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">
                💬 Conversa WhatsApp
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => fetchMessages(lead.id)}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                  ↻
                </button>
                {/* Toggle IA / Humano */}
                <button
                  onClick={toggleAI}
                  disabled={togglingAi}
                  title={aiEnabled ? "Paulo (IA) está respondendo. Clique para assumir." : "Você está no controle. Clique para reativar o Paulo."}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all disabled:opacity-50"
                  style={{
                    background: aiEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color:      aiEnabled ? "#22c55e"              : "#f87171",
                    border:     `1px solid ${aiEnabled ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  }}
                >
                  <span>{aiEnabled ? "🤖" : "👤"}</span>
                  <span>{aiEnabled ? "Paulo ativo" : "Humano"}</span>
                </button>
              </div>
            </div>

            {/* Status bar */}
            <div
              className="rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2"
              style={{ background: aiEnabled ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${aiEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: aiEnabled ? "#22c55e" : "#f87171", boxShadow: aiEnabled ? "0 0 6px #22c55e" : "none" }}
              />
              <p className="text-[10px]" style={{ color: aiEnabled ? "#86efac" : "#fca5a5" }}>
                {aiEnabled
                  ? "Paulo está respondendo automaticamente. Escreva abaixo para assumir o atendimento."
                  : "Você assumiu o atendimento. Paulo está pausado para este lead."}
              </p>
            </div>

            {/* Histórico de mensagens */}
            <div
              className="rounded-xl p-3 space-y-2 overflow-y-auto"
              style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", maxHeight: "280px" }}
            >
              {loadingMsgs ? (
                <p className="text-xs text-gray-600 text-center py-6 animate-pulse">Carregando...</p>
              ) : messages.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-6">Nenhuma conversa ainda.</p>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.from_me ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[80%] rounded-xl px-3 py-2"
                        style={{
                          background: msg.from_me ? "#e63946" : "#2a2a2a",
                          borderBottomRightRadius: msg.from_me ? "4px" : undefined,
                          borderBottomLeftRadius:  msg.from_me ? undefined : "4px",
                        }}
                      >
                        <p className="text-xs text-white leading-relaxed break-words">{msg.text}</p>
                        <p className={`text-[10px] mt-1 ${msg.from_me ? "text-red-200" : "text-gray-500"}`}>
                          {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {new Date(msg.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Input de envio manual — vendedor responde pelo CRM */}
            <div className="mt-2 flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
                }}
                placeholder="Responder como vendedor... (Enter para enviar)"
                rows={2}
                className="flex-1 rounded-xl px-3 py-2 text-xs text-gray-200 resize-none outline-none placeholder-gray-600"
                style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#e63946")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
              />
              <button
                onClick={sendReply}
                disabled={sendingReply || !replyText.trim()}
                className="px-3 rounded-xl text-xs font-bold text-white transition-opacity disabled:opacity-40 flex-shrink-0"
                style={{ background: "#e63946" }}
              >
                {sendingReply ? "..." : "↑"}
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">
              Ao enviar, Paulo é pausado automaticamente para este lead.
            </p>
          </section>

          {/* ── Seção: Linha do Tempo ─────────────────────────────── */}
          <section>
            <h3 className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">
              Linha do Tempo
            </h3>
            <ol className="space-y-0">
              <TimelineEvent
                color="#e63946"
                label="Lead criado"
                date={fmtDate(lead.created_at)}
                isLast={!lead.updated_at || lead.updated_at === lead.created_at}
              />
              {lead.updated_at && lead.updated_at !== lead.created_at && (
                <TimelineEvent
                  color="#60a5fa"
                  label={`Atualizado → ${lead.stage}`}
                  date={fmtDate(lead.updated_at)}
                  isLast
                />
              )}
            </ol>
          </section>

          {/* Espaço extra para evitar conteúdo colado no fim do scroll */}
          <div className="h-4" />
        </div>
      </div>

    </>
  );
}

// ── Sub-componente: item da timeline ─────────────────────────────────────────
function TimelineEvent({
  color, label, date, isLast,
}: {
  color: string;
  label: string;
  date: string;
  isLast: boolean;
}) {
  return (
    <li className="flex gap-3">
      {/* Coluna do indicador visual */}
      <div className="flex flex-col items-center pt-1">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        {/* Linha vertical conectando eventos — oculta no último */}
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ background: "rgba(255,255,255,0.06)", minHeight: 24 }}
          />
        )}
      </div>
      {/* Conteúdo do evento */}
      <div className="pb-4">
        <p className="text-sm text-gray-300">{label}</p>
        <p className="text-xs text-gray-600 mt-0.5">{date}</p>
      </div>
    </li>
  );
}
