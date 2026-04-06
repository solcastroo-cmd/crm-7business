"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Kanban CRM 7Business — estilo Followize
// PRIORIDADE ALTA  : arrastar e soltar leads entre colunas (HTML5 DnD nativo)
// PRIORIDADE ALTA  : atualizar stage + position no banco via PATCH /api/leads
// PRIORIDADE MÉDIA : manter posição após reload (position ordenado pelo GET)
// PRIORIDADE BAIXA : feedback visual durante drag (highlight coluna + card)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

type Lead = {
  id: string;
  phone: string;
  name: string | null;
  stage: string;
  source: string;
  position: number;   // PRIORIDADE MÉDIA: persiste ordem dentro da coluna
  created_at: string;
};

// Colunas do funil — mesma ordem do Followize
const STAGES = [
  "Novo Lead",
  "Contato Inicial",
  "Interesse",
  "Proposta",
  "Negociação",
  "VENDIDO!",
  "Perdido",
];

// Cor da borda superior de cada coluna
const STAGE_COLORS: Record<string, string> = {
  "Novo Lead":       "border-orange-400",
  "Contato Inicial": "border-blue-500",
  "Interesse":       "border-purple-500",
  "Proposta":        "border-teal-400",
  "Negociação":      "border-yellow-400",
  "VENDIDO!":        "border-green-500",
  "Perdido":         "border-red-600",
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function Home() {
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState<string | null>(null);

  // Estado visual do drag-and-drop (PRIORIDADE BAIXA — feedback)
  const [dragOverStage, setDragOverStage]   = useState<string | null>(null);
  const [dragOverLeadId, setDragOverLeadId] = useState<string | null>(null);

  // Ref para o lead que está sendo arrastado — mais confiável que dataTransfer
  const draggingRef = useRef<Lead | null>(null);

  // ── Busca inicial dos leads ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/leads")
      .then((r) => {
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setLeads(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setErro(e.message);
        setLoading(false);
      });
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Retorna leads de uma coluna, já ordenados por position (PRIORIDADE MÉDIA) */
  const leadsByStage = (stage: string) =>
    leads
      .filter((l) => l.stage === stage)
      .sort((a, b) => a.position - b.position);

  // ── Handlers de drag-and-drop (PRIORIDADE ALTA) ─────────────────────────

  /** Inicia o drag: guarda referência e aplica opacidade */
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    draggingRef.current = lead;
    e.dataTransfer.effectAllowed = "move";
    // Opacidade via DOM direto — useState causaria re-render e quebraria o drag
    (e.currentTarget as HTMLElement).style.opacity = "0.45";
  };

  /** Restaura opacidade ao soltar (independente de onde caiu) */
  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDragOverStage(null);
    setDragOverLeadId(null);
    draggingRef.current = null;
  };

  /** Permite o drop na coluna e registra sobre qual lead está passando */
  const handleDragOver = (
    e: React.DragEvent,
    stage: string,
    overLeadId?: string
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
    setDragOverLeadId(overLeadId ?? null);
  };

  /**
   * PRIORIDADE ALTA: processa o drop.
   * 1. Calcula nova position por midpoint entre os leads adjacentes
   * 2. Atualiza estado local imediatamente (otimista)
   * 3. Persiste no banco via PATCH /api/leads
   */
  const handleDrop = async (
    e: React.DragEvent,
    targetStage: string,
    beforeLeadId?: string   // lead imediatamente abaixo da posição de soltura
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const dragging = draggingRef.current;
    if (!dragging) return;

    // Limpa highlight
    setDragOverStage(null);
    setDragOverLeadId(null);

    // Leads da coluna destino excluindo o próprio card arrastado
    const stageLeads = leadsByStage(targetStage).filter(
      (l) => l.id !== dragging.id
    );

    // ── Calcula nova position por interpolação ────────────────────────────
    let newPosition: number;

    if (!beforeLeadId) {
      // Solto no final (área vazia abaixo de todos os cards)
      const last = stageLeads[stageLeads.length - 1];
      newPosition = last ? last.position + 1000 : 0;
    } else {
      const idx = stageLeads.findIndex((l) => l.id === beforeLeadId);
      const prev = stageLeads[idx - 1];
      const next = stageLeads[idx];
      const lo = prev ? prev.position : next.position - 2000;
      const hi = next ? next.position : lo + 2000;
      // Midpoint garante que não precisamos reindexar os demais cards
      newPosition = (lo + hi) / 2;
    }

    // ── Atualização otimista do estado ────────────────────────────────────
    // O usuário vê o resultado imediatamente, sem esperar o banco.
    const snapshot = leads; // guarda para rollback em caso de erro
    setLeads((prev) =>
      prev.map((l) =>
        l.id === dragging.id
          ? { ...l, stage: targetStage, position: newPosition }
          : l
      )
    );

    // ── Persiste no banco (PRIORIDADE ALTA) ───────────────────────────────
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dragging.id,
          stage: targetStage,
          position: newPosition,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback ao estado anterior se o servidor falhar
      setLeads(snapshot);
    }
  };

  // ── Renders de estado ────────────────────────────────────────────────────

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

  // ── Render principal ─────────────────────────────────────────────────────
  return (
    <main className="min-h-screen p-6">

      {/* ── Header ── */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">CRM 7Business</h1>
          <p className="text-xs text-gray-500">{leads.length} leads no funil</p>
        </div>
        <div className="flex gap-3 text-xs text-gray-400">
          <a href="/integrations" className="text-blue-400 hover:underline">
            ⚡ Integrações
          </a>
          <span>
            Vendidos:{" "}
            <strong className="text-green-400">
              {leadsByStage("VENDIDO!").length}
            </strong>
          </span>
          <span>
            Taxa:{" "}
            <strong className="text-blue-400">
              {leads.length
                ? (
                    (leadsByStage("VENDIDO!").length / leads.length) * 100
                  ).toFixed(1)
                : 0}
              %
            </strong>
          </span>
        </div>
      </header>

      {/* ── Kanban Board ── */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageLeads = leadsByStage(stage);
          // PRIORIDADE BAIXA: highlight de coluna quando o card passa sobre ela
          const isOver = dragOverStage === stage;

          return (
            <div key={stage} className="flex-shrink-0 w-64">
              {/* Coluna */}
              <div
                className={[
                  "border-t-2",
                  STAGE_COLORS[stage],
                  "bg-[#1a1d27] rounded-lg p-3 transition-all duration-150",
                  // PRIORIDADE BAIXA: anel azul indica zona de soltura ativa
                  isOver ? "ring-1 ring-blue-500 bg-[#1e2235]" : "",
                ].join(" ")}
                // Aceita drops na área vazia da coluna (abaixo dos cards)
                onDragOver={(e) => handleDragOver(e, stage)}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    {stage}
                  </span>
                  <span className="text-xs bg-[#252938] text-gray-400 px-2 py-0.5 rounded-full">
                    {stageLeads.length}
                  </span>
                </div>

                {/* Lista de cards — min-h garante área de drop quando vazia */}
                <div className="space-y-2 min-h-[48px]">
                  {stageLeads.map((lead) => {
                    // PRIORIDADE BAIXA: borda no topo indica posição de inserção
                    const isInsertTarget =
                      dragOverLeadId === lead.id && dragOverStage === stage;

                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                        // stopPropagation evita que o evento suba para a coluna
                        // enquanto o usuário passa sobre um card específico
                        onDragOver={(e) => {
                          e.stopPropagation();
                          handleDragOver(e, stage, lead.id);
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          handleDrop(e, stage, lead.id);
                        }}
                        className={[
                          "bg-[#252938] rounded-lg p-3 border",
                          "cursor-grab active:cursor-grabbing",
                          "transition-all duration-100 select-none",
                          // PRIORIDADE BAIXA: linha azul superior = posição de drop
                          isInsertTarget
                            ? "border-blue-500 border-t-2 mt-1"
                            : "border-[#2d3148] hover:border-blue-500/50",
                        ].join(" ")}
                      >
                        <p className="text-sm font-medium text-white truncate">
                          {lead.name || "Sem nome"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {lead.phone}
                        </p>
                        <span className="text-xs text-gray-600 mt-1 block">
                          {lead.source}
                        </span>
                      </div>
                    );
                  })}

                  {/* Zona de drop vazia — PRIORIDADE BAIXA: feedback visual */}
                  {stageLeads.length === 0 && (
                    <div
                      className={[
                        "text-center py-6 text-xs rounded-lg transition-all",
                        isOver
                          ? "text-blue-400 bg-blue-500/10 border border-dashed border-blue-500/40"
                          : "text-gray-600",
                      ].join(" ")}
                    >
                      {isOver ? "Solte aqui" : "vazio"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
