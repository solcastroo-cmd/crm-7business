"use client";

import { useEffect, useState } from "react";

type Integration = {
  active: boolean;
  status: string;
  webhook?: string;
  verify_token?: string;
  phone?: string;
  url?: string;
  instance?: string;
  model?: string;
  project?: string;
};

type Integrations = Record<string, Integration>;

const LABELS: Record<string, { name: string; icon: string }> = {
  whatsapp_meta:      { name: "WhatsApp Meta API",    icon: "💬" },
  whatsapp_evolution: { name: "WhatsApp Evolution",   icon: "📱" },
  instagram:          { name: "Instagram DM",         icon: "📸" },
  groq_ai:            { name: "IA Groq",              icon: "🤖" },
  supabase:           { name: "Supabase (Banco)",     icon: "🗄️" },
};

export default function IntegrationsPage() {
  const [data, setData]     = useState<Integrations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/integrations")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Integrações</h1>
          <p className="text-xs text-gray-500">Status de todos os canais conectados</p>
        </div>
        <a href="/" className="text-xs text-blue-400 hover:underline">← Voltar ao CRM</a>
      </header>

      {loading && (
        <div className="text-gray-400 text-sm animate-pulse">Verificando integrações...</div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {Object.entries(data).map(([key, val]) => (
            <div
              key={key}
              className={`bg-[#1a1d27] border rounded-xl p-4 ${val.active ? "border-green-500/30" : "border-red-500/30"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{LABELS[key]?.icon}</span>
                  <span className="text-sm font-semibold text-white">{LABELS[key]?.name}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${val.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {val.active ? "ATIVO" : "INATIVO"}
                </span>
              </div>

              <p className="text-xs text-gray-400 mb-3">{val.status}</p>

              <div className="space-y-1 text-xs text-gray-500">
                {val.webhook  && <div><span className="text-gray-600">Webhook:</span> <span className="text-gray-400 font-mono">{val.webhook}</span></div>}
                {val.verify_token && <div><span className="text-gray-600">Token:</span> <span className="text-gray-400 font-mono">{val.verify_token}</span></div>}
                {val.phone    && <div><span className="text-gray-600">Número:</span> <span className="text-gray-400">{val.phone}</span></div>}
                {val.instance && <div><span className="text-gray-600">Instância:</span> <span className="text-gray-400">{val.instance}</span></div>}
                {val.url && val.url !== "pendente" && <div><span className="text-gray-600">URL:</span> <span className="text-gray-400 font-mono">{val.url}</span></div>}
                {val.model    && <div><span className="text-gray-600">Modelo:</span> <span className="text-gray-400">{val.model}</span></div>}
                {val.project  && <div><span className="text-gray-600">Projeto:</span> <span className="text-gray-400 font-mono">{val.project}</span></div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* URL do webhook para copiar */}
      <div className="mt-8 bg-[#1a1d27] border border-[#2d3148] rounded-xl p-4 max-w-3xl">
        <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">URLs dos Webhooks</p>
        {[
          { label: "WhatsApp Meta",    path: "/api/webhook/whatsapp"  },
          { label: "Evolution API",    path: "/api/webhook/evolution" },
        ].map(({ label, path }) => (
          <div key={path} className="flex items-center justify-between py-2 border-b border-[#2d3148] last:border-0">
            <span className="text-xs text-gray-500">{label}</span>
            <code className="text-xs text-blue-400 bg-[#252938] px-2 py-1 rounded">
              {typeof window !== "undefined" ? window.location.origin : "https://crm-7business-production.up.railway.app"}{path}
            </code>
          </div>
        ))}
      </div>
    </main>
  );
}
