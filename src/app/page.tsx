"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: string;
  phone: string;
  name: string | null;
  stage: string;
  source: string;
  created_at: string;
};

const STAGES = ["Novo Lead", "Contato Inicial", "Interesse", "Proposta", "Negociação", "VENDIDO!", "Perdido"];

const STAGE_COLORS: Record<string, string> = {
  "Novo Lead":       "border-orange-400",
  "Contato Inicial": "border-blue-500",
  "Interesse":       "border-purple-500",
  "Proposta":        "border-teal-400",
  "Negociação":      "border-yellow-400",
  "VENDIDO!":        "border-green-500",
  "Perdido":         "border-red-600",
};

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => {
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        return r.json();
      })
      .then((data) => { setLeads(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((e) => { setErro(e.message); setLoading(false); });
  }, []);

  const leadsByStage = (stage: string) => leads.filter((l) => l.stage === stage);

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
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">CRM 7Business</h1>
          <p className="text-xs text-gray-500">{leads.length} leads no funil</p>
        </div>
        <div className="flex gap-3 text-xs text-gray-400">
          <span>Vendidos: <strong className="text-green-400">{leadsByStage("VENDIDO!").length}</strong></span>
          <span>Taxa: <strong className="text-blue-400">
            {leads.length ? ((leadsByStage("VENDIDO!").length / leads.length) * 100).toFixed(1) : 0}%
          </strong></span>
        </div>
      </header>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div key={stage} className="flex-shrink-0 w-64">
            <div className={`border-t-2 ${STAGE_COLORS[stage]} bg-[#1a1d27] rounded-lg p-3`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{stage}</span>
                <span className="text-xs bg-[#252938] text-gray-400 px-2 py-0.5 rounded-full">
                  {leadsByStage(stage).length}
                </span>
              </div>
              <div className="space-y-2">
                {leadsByStage(stage).map((lead) => (
                  <div key={lead.id} className="bg-[#252938] rounded-lg p-3 border border-[#2d3148] hover:border-blue-500 transition-colors cursor-pointer">
                    <p className="text-sm font-medium text-white truncate">{lead.name || "Sem nome"}</p>
                    <p className="text-xs text-gray-500 truncate">{lead.phone}</p>
                    <span className="text-xs text-gray-600 mt-1 block">{lead.source}</span>
                  </div>
                ))}
                {leadsByStage(stage).length === 0 && (
                  <div className="text-center py-4 text-xs text-gray-600">vazio</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
