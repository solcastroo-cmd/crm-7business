/**
 * 🤖 ai.ts — Resposta automática via Groq (llama-3.3-70b)
 * Fallback: mensagem padrão se API offline
 */

export type LeadContext = {
  name:    string | null;
  budget:  string | null;
  type:    string | null;
  payment: string | null;
};

export async function getAIReply(message: string, lead: LeadContext): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  const system = `Você é um vendedor profissional de automóveis da 7Business Pro.
Objetivo: qualificar o cliente descobrindo orçamento, tipo de veículo e forma de pagamento.
Seja breve, natural e persuasivo. Máximo 2 frases. Responda em português.`;

  const context = `Cliente: ${lead.name ?? "não informado"} | Orçamento: R$${lead.budget ?? "?"} | Tipo: ${lead.type ?? "?"} | Pagamento: ${lead.payment ?? "?"}`;

  if (!GROQ_API_KEY) {
    return "Olá! Sou da 7Business Pro. Como posso ajudar você a encontrar o veículo ideal?";
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 150,
        messages: [
          { role: "system",  content: system },
          { role: "user",    content: `${context}\n\nCliente disse: "${message}"` },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "Como posso ajudar você a encontrar o carro ideal?";
  } catch {
    return "Olá! Sou da 7Business Pro. Como posso ajudar você a encontrar o veículo ideal?";
  }
}

/** Extrai dados do lead a partir da mensagem */
export function extractLeadData(message: string): Partial<LeadContext> {
  const m = message.toLowerCase();
  const updates: Partial<LeadContext> = {};

  const budget = m.match(/\b\d{4,7}\b/);
  if (budget) updates.budget = budget[0];

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
