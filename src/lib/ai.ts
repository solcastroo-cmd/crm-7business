/**
 * 🤖 ai.ts — Agente PAULO com memória de conversa (como ChatGPT)
 *
 * Providers (em ordem de preferência):
 *  1. Groq  (GROQ_API_KEY)  → llama-3.3-70b-versatile — gratuito, rápido
 *  2. Anthropic (ANTHROPIC_API_KEY) → claude-haiku-3-5
 *  3. Fallback estático
 *
 * Memória: carrega o histórico completo da conversa da tabela messages
 * e envia como array [{role, content}] para o LLM — igual ao ChatGPT.
 */

export type LeadContext = {
  id?:     string | null; // ← NOVO: usado para carregar histórico
  name:    string | null;
  budget:  string | null;
  type:    string | null;
  payment: string | null;
};

export type Qualification = "quente" | "morno" | "frio";

// Tipo de mensagem para o histórico de conversa
type ChatMessage = { role: "user" | "assistant"; content: string };

// ─── System prompt padrão (usado quando ai_personality não está configurado) ──
const PAULO_SYSTEM = `Você é Paulo, o melhor vendedor de carros do mundo, atendendo pelo WhatsApp da PH Autoscar.

IDENTIDADE:
- Humano, simpático, rápido e objetivo
- NUNCA diga que é IA, robô ou assistente virtual
- Persuasivo sem parecer vendedor chato
- Especialista em veículos, financiamento e consórcio
- Tom WhatsApp brasileiro: frases curtas, linguagem simples, emojis moderados
- Sempre termine com uma pergunta quando possível
- Máximo 3-4 linhas por mensagem

ABERTURA PADRÃO (use APENAS na primeira mensagem da conversa):
"Olá 😊 aqui é o Paulo da phautoscar. Vi que você demonstrou interesse em um veículo. Me conta, é esse modelo mesmo que você procura ou está avaliando outras opções também?"

INTERPRETAÇÃO DO INTERESSE:
- Cliente manda FOTO: identificar marca/modelo → "Que carrão 👀 você está procurando esse modelo mesmo?"
- Cliente manda TEXTO com modelo: confirmar → "Perfeito! Você procura exatamente esse modelo?"
- Cliente manda intenção geral (ex: carro até 50 mil): confirmar faixa

SPIN SELLING — perguntas em sequência após confirmar interesse:
1. USO: "O carro seria mais para uso do dia a dia, trabalho ou família?"
2. FORMA: "Você pretende financiar, pagar à vista ou tem carta de consórcio?"
3. ENTRADA: "Pretende dar entrada ou financiar 100%?"
4. PRAZO: "Prefere parcelas mais baixas ou prazo menor?"

FINANCIAMENTO:
"Conseguimos simular rapidinho com os bancos 😊 Pode ser pelo CPF ou pela sua CNH. Qual prefere enviar?"
Após doc: "Perfeito 🙌 vou rodar a simulação nos bancos e já te trago as melhores taxas."
A loja trabalha com TODOS os bancos.

CONSÓRCIO:
"Perfeito! Trabalhamos com carta de consórcio sim 😊 Você já tem a carta contemplada?"
Se SIM: "Ótimo! A carta funciona como pagamento à vista, facilita muito a aprovação."

APRESENTAÇÃO DE VEÍCULO (formato obrigatório):
"Tenho uma opção perfeita para você 👇
🚗 [MARCA MODELO]
📅 Ano: [ano]
💰 Valor: R$ [valor]
⛽ Combustível: [combustível]
📍 Loja: PH Autoscar
Vou te enviar as fotos agora 👇"

FECHAMENTO:
"Esse carro combina muito com o que você procura 😊 Quer agendar uma visita ou prefere finalizar tudo online?"
"Se quiser, já deixo pré-aprovado para você hoje."

REGRAS ABSOLUTAS:
- NUNCA diga "sou IA", "sou robô", "sou assistente virtual"
- NUNCA use textos longos
- NUNCA pressione agressivamente
- SEMPRE soar 100% humano e consultivo
- SEMPRE conduzir para: CPF/CNH → simulação → visita → venda
- Responda SEMPRE em português do Brasil`;

// ─── Carrega histórico de conversa do banco ───────────────────────────────────
async function loadHistory(leadId: string): Promise<ChatMessage[]> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("messages")
      .select("text, from_me, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(30); // últimas 30 mensagens = contexto suficiente sem estourar tokens

    if (!data || data.length === 0) return [];

    return data.map((m) => ({
      role:    m.from_me ? "assistant" : "user",
      content: m.text ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── Monta system prompt com contexto do lead + estoque ─────────────────────
async function buildSystemPrompt(
  baseSystem: string,
  lead: LeadContext,
): Promise<string> {
  // Contexto do lead (nome, orçamento, tipo, pagamento)
  const leadCtx = [
    lead.name    ? `Nome do cliente: ${lead.name}` : null,
    lead.budget  ? `Orçamento informado: R$${Number(lead.budget).toLocaleString("pt-BR")}` : null,
    lead.type    ? `Tipo de veículo preferido: ${lead.type}` : null,
    lead.payment ? `Forma de pagamento: ${lead.payment}` : null,
  ].filter(Boolean);

  // Estoque disponível
  const inventory = await getInventoryContext();

  let system = baseSystem;
  if (leadCtx.length > 0) {
    system += `\n\n--- DADOS DO CLIENTE (use para personalizar a conversa) ---\n${leadCtx.join("\n")}`;
  }
  if (inventory) {
    system += inventory;
  }

  return system;
}

// ─── Estoque disponível ───────────────────────────────────────────────────────
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
        v.year         ? `Ano ${v.year}`                                          : null,
        v.color        ? v.color                                                  : null,
        v.km           ? `${Number(v.km).toLocaleString("pt-BR")} km`             : null,
        v.fuel         ? v.fuel                                                   : null,
        v.transmission ? v.transmission                                            : null,
        v.plate        ? `Placa ${v.plate}`                                        : null,
        v.price        ? `R$ ${Number(v.price).toLocaleString("pt-BR")}`          : null,
        v.description  ? `(${v.description})`                                     : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    }).join("\n");

    return `\n\n--- ESTOQUE DISPONÍVEL NA LOJA (use para sugerir veículos) ---\n${lines}`;
  } catch {
    return "";
  }
}

// ─── Chama Groq com histórico completo ───────────────────────────────────────
async function replyViaGroq(
  systemPrompt: string,
  history: ChatMessage[],
  currentMessage: string,
): Promise<string> {
  const messages = [
    ...history,
    { role: "user" as const, content: currentMessage },
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  500,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

// ─── Chama Anthropic (Claude) com histórico completo ─────────────────────────
async function replyViaAnthropic(
  systemPrompt: string,
  history: ChatMessage[],
  currentMessage: string,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = [
    ...history,
    { role: "user" as const, content: currentMessage },
  ];

  const response = await client.messages.create({
    model:       "claude-haiku-4-5",
    max_tokens:  500,
    system:      systemPrompt,
    messages,
  });

  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

// ─── Função principal: responde com memória de conversa ──────────────────────
export async function getAIReply(
  message:           string,
  lead:              LeadContext,
  customPersonality?: string | null,
  agentName?:         string | null,
): Promise<string> {
  const name     = agentName ?? "Paulo";
  const fallback = `Olá! Sou o ${name} da PH Autoscar. Como posso ajudar você a encontrar o veículo ideal? 😊`;

  // Escolhe o system prompt: personalidade customizada (Settings) ou padrão
  const baseSystem = customPersonality?.trim()
    ? (customPersonality.toLowerCase().includes("paulo") || customPersonality.toLowerCase().includes("você é")
        ? customPersonality
        : `Você é ${name}, vendedor da PH Autoscar.\n\n${customPersonality}`)
    : PAULO_SYSTEM;

  // Monta system prompt com contexto do lead + estoque
  const systemPrompt = await buildSystemPrompt(baseSystem, lead);

  // Carrega histórico de conversa (memória como ChatGPT)
  const history = lead.id ? await loadHistory(lead.id) : [];

  console.log(`[AI] Lead ${lead.id ?? "?"} | histórico: ${history.length} msgs | modelo: ${process.env.GROQ_API_KEY ? "groq" : "anthropic"}`);

  try {
    if (process.env.GROQ_API_KEY) {
      const reply = await replyViaGroq(systemPrompt, history, message);
      if (reply) return reply;
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const reply = await replyViaAnthropic(systemPrompt, history, message);
      if (reply) return reply;
    }
  } catch (e) {
    console.error("[AI] Erro ao gerar resposta:", e);
  }

  return fallback;
}

// ─── qualifyLead ─────────────────────────────────────────────────────────────
export function qualifyLead(message: string): Qualification {
  const m = message.toLowerCase();

  const sinaisQuente = [
    "comprar agora", "comprar hoje", "quero fechar", "quero comprar",
    "vou levar", "quero esse", "reserva pra mim", "pode reservar",
    "quanto custa", "qual o preço", "qual o valor", "qual o menor preço",
    "tá bom o preço", "faz negócio", "desconto", "aceita troca",
    "me passa o pix", "valor à vista",
    "tem parcela", "tem financiamento", "posso parcelar", "quero financiar",
    "quero simular", "faz simulação", "manda simulação", "aprovação",
    "meu cpf", "minha cnh", "vou mandar o cpf", "vou mandar a cnh",
    "posso ir buscar", "quando posso ver", "quero agendar", "pode me ligar",
    "vou visitar", "posso ir lá", "quando abre", "endereço da loja",
  ];

  const sinaisMorno = [
    "gostei", "interessante", "me fala mais", "tem outro", "como funciona",
    "me envia foto", "manda foto", "tem foto",
    "tem km", "qual ano", "que cor", "qual motor", "quantas portas",
    "tem ar condicionado", "manual ou automático", "tem revisão",
    "qual a procedência", "tem garantia", "tem ipva", "único dono",
    "tem manual", "chave reserva", "consume muito",
    "estou vendo", "estou pesquisando", "comparando", "avaliando outras",
  ];

  if (sinaisQuente.some((kw) => m.includes(kw))) return "quente";
  if (sinaisMorno.some((kw) => m.includes(kw))) return "morno";
  return "frio";
}

// ─── parseBudget ─────────────────────────────────────────────────────────────
function parseBudget(raw: string): string {
  let n = raw.replace(/r\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  const milMatch = n.match(/^(\d+[\d.]*)\s*mil/i);
  if (milMatch) return String(Math.round(parseFloat(milMatch[1]) * 1000));
  const kMatch = n.match(/^(\d+[\d.]*)\s*k/i);
  if (kMatch) return String(Math.round(parseFloat(kMatch[1]) * 1000));
  return n.replace(/\D/g, "");
}

// ─── extractLeadData ─────────────────────────────────────────────────────────
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

  if (m.includes("financ"))                            updates.payment = "Financiado";
  if (m.includes("à vista") || m.includes("avista"))  updates.payment = "À Vista";

  const nameMatch = m.match(/(?:meu nome é|me chamo|sou o|sou a)\s+([a-záéíóúãõ]+)/i);
  if (nameMatch) updates.name = nameMatch[1];

  return updates;
}
