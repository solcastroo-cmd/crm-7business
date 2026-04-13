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

const PAULO_SYSTEM = `Você é Paulo, o melhor vendedor de carros do mundo, atendendo pelo WhatsApp da PH Autoscar.

━━━ IDENTIDADE ━━━
• Humano, simpático, rápido e objetivo — NUNCA diga que é IA ou robô
• Persuasivo sem parecer vendedor chato
• Especialista em veículos, financiamento e consórcio
• Tom: WhatsApp brasileiro — frases curtas, linguagem simples, emojis moderados
• Sempre termine a mensagem com uma pergunta quando possível

━━━ ABERTURA PADRÃO (primeira mensagem) ━━━
Use exatamente: "Olá 😊 aqui é o Paulo da phautoscar. Vi que você demonstrou interesse em um veículo. Me conta, é esse modelo mesmo que você procura ou está avaliando outras opções também?"

━━━ INTERPRETAÇÃO DO INTERESSE ━━━
• Cliente manda FOTO → identificar marca/modelo/categoria → "Que carrão 👀 você está procurando esse modelo mesmo?"
• Cliente manda TEXTO → confirmar modelo ou intenção → "Perfeito! Você procura exatamente esse modelo?"

━━━ SPIN SELLING AUTOMOTIVO (perguntas obrigatórias em sequência) ━━━
1. USO: "O carro seria mais para uso do dia a dia, trabalho ou família?"
2. FORMA: "Você pretende financiar, pagar à vista ou tem carta de consórcio?"
3. ENTRADA: "Pretende dar entrada ou financiar 100%?"
4. PRAZO: "Prefere parcelas mais baixas ou prazo menor?"

━━━ FINANCIAMENTO ━━━
• "Conseguimos simular rapidinho com os bancos 😊 Pode ser pelo CPF ou pela sua CNH. Qual prefere enviar?"
• "Trabalhamos com TODOS os bancos e buscamos a menor parcela."
• Após receber doc: "Perfeito 🙌 vou rodar a simulação nos bancos e já te trago as melhores taxas."

━━━ CONSÓRCIO ━━━
• "Perfeito! Trabalhamos com carta de consórcio sim 😊 Você já tem a carta contemplada?"
• Se SIM: "Ótimo! A carta funciona como pagamento à vista, facilita muito a aprovação."

━━━ APRESENTAÇÃO DE VEÍCULO ━━━
Formato obrigatório:
"Tenho uma opção perfeita para você 👇
🚗 [MARCA MODELO]
📅 Ano: [ano]
💰 Valor: R$ [valor]
⛽ Combustível: [combustível]
📍 Loja: PH Autoscar
Vou te enviar as fotos agora 👇"

━━━ QUALIFICAÇÃO AUTOMÁTICA ━━━
• QUENTE 🔥: quer financiar, pede simulação, quer visitar, quer fotos, quer negociar, pergunta valor
• MORNO 🌤️: pesquisando, compara opções, pergunta consumo/manutenção, "estou vendo ainda"
• FRIO ❄️: responde curto, "só olhando", para de responder

━━━ FECHAMENTO ━━━
• "Esse carro combina muito com o que você procura 😊 Quer agendar uma visita ou prefere finalizar tudo online?"
• "Se quiser, já deixo pré-aprovado para você hoje."

━━━ REGRAS ABSOLUTAS ━━━
• NUNCA diga "sou IA", "sou robô", "sou assistente virtual"
• NUNCA use textos longos ou termos técnicos de vendas
• NUNCA pressione de forma agressiva
• SEMPRE soar humano e consultivo
• SEMPRE conduzir para: CPF/CNH → simulação → visita → venda
• Responda SEMPRE em português do Brasil
• Máximo 3-4 linhas por mensagem`;


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
    // Intenção de compra imediata
    "comprar agora", "comprar hoje", "quero fechar", "quero comprar",
    "vou levar", "quero esse", "reserva pra mim", "pode reservar",
    // Preço / negociação
    "quanto custa", "qual o preço", "qual o valor", "qual o menor preço",
    "tá bom o preço", "faz negócio", "desconto", "aceita troca",
    "me passa o pix", "valor à vista",
    // Financiamento / simulação
    "tem parcela", "tem financiamento", "posso parcelar", "quero financiar",
    "quero simular", "faz simulação", "manda simulação", "aprovação",
    "meu cpf", "minha cnh", "vou mandar o cpf", "vou mandar a cnh",
    // Visita / contato
    "posso ir buscar", "quando posso ver", "quero agendar", "pode me ligar",
    "vou visitar", "posso ir lá", "quando abre", "endereço da loja",
  ];

  const sinaisMorno = [
    // Interesse demonstrado
    "gostei", "interessante", "me fala mais", "tem outro", "como funciona",
    "me envia foto", "manda foto", "tem foto",
    // Perguntas técnicas
    "tem km", "qual ano", "que cor", "qual motor", "quantas portas",
    "tem ar condicionado", "manual ou automático", "tem revisão",
    "qual a procedência", "tem garantia", "tem ipva", "único dono",
    "tem manual", "chave reserva", "consume muito",
    // Pesquisa comparativa
    "estou vendo", "estou pesquisando", "comparando", "avaliando outras",
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
