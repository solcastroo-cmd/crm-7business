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

/** Normaliza valor monetário para número string */
function parseBudget(raw: string): string {
  // Remove R$, espaços, pontos de milhar, vírgulas
  let n = raw.replace(/r\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  // "90 mil" ou "90mil" → 90000
  const milMatch = n.match(/^(\d+[\d.]*)\s*mil/i);
  if (milMatch) return String(Math.round(parseFloat(milMatch[1]) * 1000));
  // "90k" → 90000
  const kMatch = n.match(/^(\d+[\d.]*)\s*k/i);
  if (kMatch) return String(Math.round(parseFloat(kMatch[1]) * 1000));
  return n.replace(/\D/g, "");
}

/** Extrai dados do lead a partir da mensagem */
export function extractLeadData(message: string): Partial<LeadContext> {
  const m = message.toLowerCase();
  const updates: Partial<LeadContext> = {};

  // Padrões de budget: "90 mil", "90k", "R$ 90.000", "90000", "noventa mil"
  const budgetPatterns = [
    /r\$\s*[\d.,]+\s*(?:mil|k)?/i,   // R$ 90.000 / R$ 90 mil
    /[\d]+[.,]?[\d]*\s*mil/i,         // 90 mil / 90.5 mil
    /[\d]+\s*k\b/i,                   // 90k
    /até\s+[\d.,]+/i,                 // até 80000
    /\b\d{4,7}\b/,                    // número puro 4-7 dígitos
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
