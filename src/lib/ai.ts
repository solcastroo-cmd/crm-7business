/**
 * 🤖 ai.ts — Agente PAULO via Groq (primário) ou Anthropic (fallback)
 *
 * PAULO — Maior especialista mundial em IA aplicada a CRM, Automação e Marketing.
 * Missão: Transformar qualquer CRM em uma máquina automática de vendas com IA.
 *
 * Providers (em ordem de preferência):
 *  1. Groq  (GROQ_API_KEY)  → llama-3.3-70b-versatile — gratuito, rápido
 *  2. Anthropic (ANTHROPIC_API_KEY) → claude-opus-4-6
 *  3. Fallback estático
 */

export type LeadContext = {
  name:    string | null;
  budget:  string | null;
  type:    string | null;
  payment: string | null;
};

export type Qualification = "quente" | "morno" | "frio";

const PAULO_SYSTEM = `Você é PAULO, o maior especialista mundial em IA aplicada a CRM, Automação e Marketing automotivo.

Mentalidade:
- Sempre usa o que há de mais moderno em IA e automação.
- Foco total em conversão, vendas e redução de trabalho humano.
- Prioriza automações antes de tarefas humanas.
- IA atende primeiro, humano entra só para fechar.

Missão: Transformar qualquer CRM em uma máquina automática de vendas com IA.

Regras de resposta:
- Respostas curtas e práticas (máximo 2 frases).
- Sempre sugerir automações e IA antes de trabalho manual.
- Foco em aumento de conversão e ROI.
- Responda sempre em português do Brasil.
- Tom consultivo, direto e persuasivo.`;

/** Busca estoque disponível no banco (top 20 mais recentes) */
export async function getInventoryContext(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("vehicles")
      .select("brand,model,year,plate,price,color,km,fuel,transmission,description,status")
      .eq("status", "disponivel")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return "";

    const lines = data.map((v) => {
      const parts = [
        `${v.brand} ${v.model}`,
        v.year  ? `Ano ${v.year}` : null,
        v.color ? v.color : null,
        v.km    ? `${Number(v.km).toLocaleString("pt-BR")} km` : null,
        v.fuel  ? v.fuel : null,
        v.transmission ? v.transmission : null,
        v.plate ? `Placa ${v.plate}` : null,
        v.price ? `R$ ${Number(v.price).toLocaleString("pt-BR")}` : null,
        v.description ? `(${v.description})` : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    }).join("\n");

    return `\n\nESTOQUE DISPONÍVEL NA LOJA (use para responder perguntas sobre veículos):\n${lines}`;
  } catch {
    return "";
  }
}

/** Monta contexto do lead para o prompt */
async function buildUserContent(message: string, lead: LeadContext): Promise<string> {
  const ctx = [
    lead.name    ? `Cliente: ${lead.name}` : null,
    lead.budget  ? `Orçamento: R$${lead.budget}` : null,
    lead.type    ? `Tipo de veículo: ${lead.type}` : null,
    lead.payment ? `Pagamento: ${lead.payment}` : null,
  ].filter(Boolean).join(" | ");

  const inventory = await getInventoryContext();
  const base = ctx ? `${ctx}\n\nCliente disse: "${message}"` : `Cliente disse: "${message}"`;
  return base + inventory;
}

/** Chama Groq (OpenAI-compat) */
async function replyViaGroq(userContent: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 200,
      messages: [
        { role: "system",  content: PAULO_SYSTEM },
        { role: "user",    content: userContent  },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

/** Chama Anthropic (Claude) */
async function replyViaAnthropic(userContent: string): Promise<string> {
  // Dynamic import so the SDK is tree-shaken when not used
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 200,
    system: PAULO_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

export async function getAIReply(
  message:          string,
  lead:             LeadContext,
  customPersonality?: string | null,
  agentName?:        string | null,
): Promise<string> {
  const userContent = await buildUserContent(message, lead);
  const name        = agentName ?? "PAULO";
  const fallback    = `Olá! Sou ${name} da 7Business Pro. Como posso ajudar você a encontrar o veículo ideal?`;

  // Usa personalidade customizada se fornecida
  if (customPersonality) {
    const customSystem = customPersonality.includes(name)
      ? customPersonality
      : `Você é ${name}. ${customPersonality}`;
    try {
      if (process.env.GROQ_API_KEY) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile", max_tokens: 200,
            messages: [{ role: "system", content: customSystem }, { role: "user", content: userContent }],
          }),
        });
        if (res.ok) {
          const data = await res.json() as { choices: { message: { content: string } }[] };
          return data.choices[0]?.message?.content?.trim() || fallback;
        }
      }
      if (process.env.ANTHROPIC_API_KEY) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: "claude-opus-4-6", max_tokens: 200,
          system: customSystem,
          messages: [{ role: "user", content: userContent }],
        });
        const block = response.content.find((b) => b.type === "text");
        return block?.type === "text" ? block.text.trim() || fallback : fallback;
      }
    } catch (e) { console.error("[AI] Erro personalidade customizada:", e); }
    return fallback;
  }

  try {
    if (process.env.GROQ_API_KEY)        return await replyViaGroq(userContent)      || fallback;
    if (process.env.ANTHROPIC_API_KEY)   return await replyViaAnthropic(userContent) || fallback;
  } catch (e) {
    console.error("[AI] Erro:", e);
  }

  return fallback;
}

/**
 * 🔥 qualifyLead — classifica lead em Quente / Morno / Frio
 *
 * Quente  = sinais fortes de compra imediata → notifica vendedor
 * Morno   = interesse demonstrado, sem urgência
 * Frio    = curiosidade inicial ou sem sinal claro
 */
export function qualifyLead(message: string): Qualification {
  const m = message.toLowerCase();

  const sinaisQuente = [
    "comprar agora", "comprar hoje", "quero fechar", "quero comprar",
    "vou levar", "quanto custa", "tem parcela", "tem financiamento",
    "posso parcelar", "qual o menor preço", "posso ir buscar",
    "quando posso ver", "quero agendar", "pode me ligar", "faz negócio",
    "me passa o pix", "valor à vista", "tá bom o preço", "aceita troca",
    "quero esse", "reserva pra mim",
  ];

  const sinaisMorno = [
    "gostei", "interessante", "me fala mais", "tem outro", "como funciona",
    "me envia foto", "tem km", "qual ano", "que cor", "qual motor",
    "tem ipva", "quantas portas", "tem ar condicionado", "manual ou automático",
    "tem revisão", "qual a procedência", "tem garantia",
  ];

  if (sinaisQuente.some((kw) => m.includes(kw))) return "quente";
  if (sinaisMorno.some((kw) => m.includes(kw))) return "morno";
  return "frio";
}

/** Normaliza valor monetário para número string */
function parseBudget(raw: string): string {
  let n = raw.replace(/r\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  const milMatch = n.match(/^(\d+[\d.]*)\s*mil/i);
  if (milMatch) return String(Math.round(parseFloat(milMatch[1]) * 1000));
  const kMatch = n.match(/^(\d+[\d.]*)\s*k/i);
  if (kMatch) return String(Math.round(parseFloat(kMatch[1]) * 1000));
  return n.replace(/\D/g, "");
}

/** Extrai dados do lead a partir da mensagem */
export function extractLeadData(message: string): Partial<LeadContext> {
  const m = message.toLowerCase();
  const updates: Partial<LeadContext> = {};

  const budgetPatterns = [
    /r\$\s*[\d.,]+\s*(?:mil|k)?/i,
    /[\d]+[.,]?[\d]*\s*mil/i,
    /[\d]+\s*k\b/i,
    /até\s+[\d.,]+/i,
    /\b\d{4,7}\b/,
  ];

  for (const pattern of budgetPatterns) {
    const match = m.match(pattern);
    if (match) {
      const parsed = parseBudget(match[0]);
      if (parsed && parsed.length >= 4) { updates.budget = parsed; break; }
    }
  }

  if (m.includes("hatch"))  updates.type = "Hatch";
  if (m.includes("sedan"))  updates.type = "Sedan";
  if (m.includes("suv"))    updates.type = "SUV";
  if (m.includes("pickup")) updates.type = "Pickup";

  if (m.includes("financ"))                              updates.payment = "Financiado";
  if (m.includes("à vista") || m.includes("avista"))    updates.payment = "À Vista";

  const nameMatch = m.match(/(?:meu nome é|me chamo|sou o|sou a)\s+([a-záéíóúãõ]+)/i);
  if (nameMatch) updates.name = nameMatch[1];

  return updates;
}
