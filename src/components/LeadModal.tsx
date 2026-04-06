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

import { useState, useEffect, useRef } from "react";

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

// ── Componente principal ─────────────────────────────────────────────────────
export function LeadModal({ lead, onClose, onUpdate }: Props) {
  const [notes, setNotes]     = useState(lead?.notes ?? "");
  const [saving, setSaving]   = useState(false);
  // Ref para o timeout do debounce — cancelado a cada keystroke
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza anotações quando outro lead é aberto
  useEffect(() => {
    setNotes(lead?.notes ?? "");
  }, [lead?.id]);

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
            {/* Badge de estágio */}
            <span
              className={`mt-2 inline-block text-xs px-2.5 py-0.5 rounded-full
                          font-medium border ${STAGE_BADGE[lead.stage] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}
            >
              {lead.stage}
            </span>
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
              onFocus={(e) => (e.currentTarget.style.borderColor = "#FF7A00")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            />
          </section>

          {/* ── Seção: Histórico ──────────────────────────────────────── */}
          <section>
            <h3 className="section-title mb-3">Histórico</h3>
            <ol className="space-y-0">

              {/* Evento: lead criado */}
              <TimelineEvent
                color="#FF7A00"
                label="Lead criado"
                date={fmtDate(lead.created_at)}
                isLast={!lead.updated_at || lead.updated_at === lead.created_at}
              />

              {/* Evento: última atualização (se diferente da criação) */}
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
