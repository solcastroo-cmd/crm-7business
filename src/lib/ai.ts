/**
 * 🤖 ai.ts — Agente PAULO com memória completa de conversa (ChatGPT-style)
 *
 * Providers (em ordem de preferência):
 *  1. Groq  (GROQ_API_KEY)  → llama-3.3-70b-versatile — gratuito, rápido (~300ms)
 *  2. Anthropic (ANTHROPIC_API_KEY) → claude-haiku-4-5
 *  3. Fallback estático (nunca deveria chegar aqui em produção)
 *
 * Memória: carrega histórico completo da conversa (últimas 40 msgs)
 * e envia como [{role, content}] para o LLM — igual ao ChatGPT.
 *
 * Estoque: injeta veículos disponíveis no system prompt com instrução
 * de usar [VEICULO:uuid] para acionar envio automático de fotos.
 */

export type LeadContext = {
  id?:     string | null;
  name:    string | null;
  budget:  string | null;
  type:    string | null;
  payment: string | null;
};

export type Qualification = "quente" | "morno" | "frio";

type ChatMessage = { role: "user" | "assistant"; content: string };

// ─── System prompt padrão ────────────────────────────────────────────────────
const PAULO_SYSTEM = `Você é Paulo, vendedor da PH Autoscar, atendendo pelo WhatsApp.

QUEM VOCÊ É:
- Vendedor humano, simpático, consultivo e objetivo
- NUNCA revele que é IA, robô ou assistente virtual
- Especialista em carros, financiamento, consórcio e troca
- Fala como brasileiro: frases curtas, diretas, com emojis moderados
- Sempre termina com uma pergunta para manter o diálogo
- Máximo 3-4 linhas por mensagem — nunca textos longos

PRIMEIRA MENSAGEM (use APENAS se for o início da conversa, sem histórico anterior):
"Olá! 😊 Aqui é o Paulo da PH Autoscar. Vi que você demonstrou interesse em um veículo. Me conta — você está buscando para uso próprio ou é presentear alguém?"

FLUXO DE ATENDIMENTO (SPIN Selling — siga esta ordem):
1. CONFIRMAR INTERESSE: "É esse modelo mesmo que você procura ou está avaliando opções?"
2. USO: "Seria para uso do dia a dia, trabalho ou família?"
3. FORMA DE PAGAMENTO: "Pretende financiar, pagar à vista ou tem carta de consórcio?"
4. ENTRADA: "Tem algum valor para dar de entrada?"
5. APRESENTAR VEÍCULO DO ESTOQUE que combine com o perfil
6. FECHAR: "Quer agendar uma visita ou prefere resolver tudo online?"

QUANDO CLIENTE PEDE FOTOS OU QUER VER O CARRO:
- Apresente o veículo no formato abaixo E adicione a tag [VEICULO:ID] na linha final
- Formato de apresentação:
  "Perfeito! Tenho uma opção que combina muito com o que você procura 👇
  🚗 [MARCA MODELO ANO]
  💰 R$ [VALOR]
  ⛽ [COMBUSTÍVEL] | [CÂMBIO]
  📍 PH Autoscar — Fortaleza CE
  Vou te mandar as fotos agora 👇"
  [VEICULO:ID_DO_VEICULO]

FINANCIAMENTO:
"Conseguimos simular rapidinho com os bancos parceiros 😊
Trabalhamos com todos os bancos — BV, Santander, Itaú, Bradesco e mais.
Me passa seu CPF ou CNH para rodar a simulação?"
Após receber: "Perfeito! Vou checar as melhores condições e já te mando as opções 🙌"

CONSÓRCIO:
"Trabalhamos com consórcio sim! Você já tem carta contemplada?"
- SIM: "Ótimo! Carta contemplada funciona como pagamento à vista — facilita muito!"
- NÃO: "Posso te indicar um consultor de consórcio se preferir essa modalidade 😊"

TROCA:
"Claro! Trabalhamos com troca sim. Qual é o seu carro atual? Marca, modelo e ano?"
Após receber: "Perfeito! Vou verificar a avaliação e já volto com uma proposta."

REGRAS ABSOLUTAS:
- NUNCA diga "sou IA", "sou robô", "sou assistente virtual", "como IA"
- NUNCA escreva parágrafos longos — máximo 4 linhas
- NUNCA pressione o cliente de forma agressiva
- SEMPRE soar 100% humano e consultivo
- SEMPRE conduzir para: interesse → dados → simulação/visita → venda
- Responda SEMPRE em português do Brasil
- Se cliente mandar áudio, diga: "Recebi seu áudio! Aqui pelo WhatsApp prefiro responder por texto para ficar tudo registrado 😊 Me conta o que precisa?"
- Se cliente mandar imagem de carro, diga: "Que modelo bacana! 👀 É exatamente esse que você procura?"`;

// ─── Carrega histórico de conversa ───────────────────────────────────────────
async function loadHistory(leadId: string): Promise<ChatMessage[]> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("messages")
      .select("text, from_me, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(40); // 40 mensagens = memória robusta sem estourar tokens

    if (!data || data.length === 0) return [];

    return data
      .filter(m => (m.text ?? "").trim() !== "")
      .map((m): ChatMessage => ({
        role:    m.from_me ? "assistant" : "user",
        content: m.text ?? "",
      }));
  } catch {
    return [];
  }
}

// ─── Estoque disponível com IDs para envio de fotos ──────────────────────────
export async function getInventoryContext(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("vehicles")
      .select("id,brand,model,year,plate,price,color,km,fuel,transmission,description,status,photos")
      .eq("status", "disponivel")
      .order("created_at", { ascending: false })
      .limit(25);

    if (!data || data.length === 0) return "\n\n--- ESTOQUE ---\nNenhum veículo disponível no momento.";

    const lines = data.map((v) => {
      const hasPhotos = Array.isArray(v.photos) && v.photos.length > 0;
      const parts = [
        `${v.brand} ${v.model}`,
        v.year         ? `${v.year}`                                        : null,
        v.color        ? v.color                                             : null,
        v.km           ? `${Number(v.km).toLocaleString("pt-BR")}km`        : null,
        v.fuel         ? v.fuel                                              : null,
        v.transmission ? v.transmission                                      : null,
        v.price        ? `R$${Number(v.price).toLocaleString("pt-BR")}`     : null,
        v.description  ? `(${v.description})`                               : null,
        hasPhotos      ? `[${v.photos.length} fotos]`                       : "[sem fotos]",
      ].filter(Boolean);
      return `• ID:${v.id} | ${parts.join(" | ")}`;
    }).join("\n");

    return (
      `\n\n--- ESTOQUE DISPONÍVEL (${data.length} veículos) ---\n` +
      `INSTRUÇÃO IMPORTANTE: Quando apresentar um veículo específico, inclua OBRIGATORIAMENTE\n` +
      `na ÚLTIMA linha da mensagem exatamente: [VEICULO:ID_DO_VEICULO]\n` +
      `Exemplo: [VEICULO:a1b2c3d4-e5f6-...] — isso envia as fotos automaticamente.\n\n` +
      lines
    );
  } catch {
    return "";
  }
}

// ─── Extrai tag de veículo e retorna texto limpo ──────────────────────────────
export function parseVehicleTag(reply: string): { message: string; vehicleId: string | null } {
  const match = reply.match(/\[VEICULO:([a-f0-9-]{36})\]/i);
  if (!match) return { message: reply.trim(), vehicleId: null };
  const vehicleId = match[1];
  const message   = reply.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { message, vehicleId };
}

// ─── Monta system prompt completo ────────────────────────────────────────────
async function buildSystemPrompt(baseSystem: string, lead: LeadContext): Promise<string> {
  const leadCtx: string[] = [];
  if (lead.name)    leadCtx.push(`Nome do cliente: ${lead.name}`);
  if (lead.budget)  leadCtx.push(`Orçamento: R$${Number(lead.budget).toLocaleString("pt-BR")}`);
  if (lead.type)    leadCtx.push(`Tipo de veículo desejado: ${lead.type}`);
  if (lead.payment) leadCtx.push(`Forma de pagamento: ${lead.payment}`);

  const inventory = await getInventoryContext();

  let system = baseSystem;
  if (leadCtx.length > 0) {
    system += `\n\n--- PERFIL DO CLIENTE (use para personalizar) ---\n${leadCtx.join("\n")}`;
  }
  system += inventory;
  return system;
}

// ─── Groq ─────────────────────────────────────────────────────────────────────
async function replyViaGroq(
  systemPrompt: string,
  history: ChatMessage[],
  currentMessage: string,
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  600,
      temperature: 0.65,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: currentMessage },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

// ─── Anthropic ───────────────────────────────────────────────────────────────
async function replyViaAnthropic(
  systemPrompt: string,
  history: ChatMessage[],
  currentMessage: string,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 600,
    system:     systemPrompt,
    messages:   [...history, { role: "user", content: currentMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

// ─── Função principal ─────────────────────────────────────────────────────────
export async function getAIReply(
  message:            string,
  lead:               LeadContext,
  customPersonality?: string | null,
  agentName?:         string | null,
): Promise<string> {
  const name     = agentName ?? "Paulo";
  const fallback = `Olá! 😊 Aqui é o ${name} da PH Autoscar. Como posso ajudar você a encontrar o veículo ideal?`;

  // Sistema: usa personalidade customizada do Settings ou o padrão
  let baseSystem: string;
  if (customPersonality?.trim()) {
    const lc = customPersonality.toLowerCase();
    baseSystem = (lc.includes("você é") || lc.includes("voce e") || lc.includes("paulo"))
      ? customPersonality
      : `Você é ${name}, vendedor da PH Autoscar.\n\n${customPersonality}`;
  } else {
    baseSystem = PAULO_SYSTEM;
  }

  const systemPrompt = await buildSystemPrompt(baseSystem, lead);
  const history      = lead.id ? await loadHistory(lead.id) : [];

  const provider = process.env.GROQ_API_KEY ? "groq" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  console.log(`[AI] Lead:${lead.id ?? "?"} | histórico:${history.length}msgs | provider:${provider}`);

  if (provider === "none") {
    console.error("[AI] ERRO CRÍTICO: Nenhuma API key configurada (GROQ_API_KEY ou ANTHROPIC_API_KEY)");
    return fallback;
  }

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
    // Tenta o próximo provider se o primeiro falhou
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const reply = await replyViaAnthropic(systemPrompt, history, message);
        if (reply) return reply;
      }
    } catch (e2) {
      console.error("[AI] Fallback também falhou:", e2);
    }
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
    "me passa o pix", "valor à vista", "valor a vista",
    "tem parcela", "tem financiamento", "posso parcelar", "quero financiar",
    "quero simular", "faz simulação", "manda simulação", "aprovação",
    "meu cpf", "minha cnh", "vou mandar o cpf", "vou mandar a cnh",
    "posso ir buscar", "quando posso ver", "quero agendar", "pode me ligar",
    "vou visitar", "posso ir lá", "posso ir la", "quando abre", "endereço da loja",
    "qual endereço", "como chego",
  ];

  const sinaisMorno = [
    "gostei", "interessante", "me fala mais", "tem outro", "como funciona",
    "me envia foto", "manda foto", "tem foto", "quero ver foto",
    "tem km", "qual ano", "que cor", "qual motor", "quantas portas",
    "tem ar condicionado", "manual ou automático", "tem revisão",
    "qual a procedência", "tem garantia", "tem ipva", "único dono",
    "tem manual", "chave reserva", "consume muito",
    "estou vendo", "estou pesquisando", "comparando", "avaliando",
    "qual modelo", "qual carro", "me indica",
  ];

  if (sinaisQuente.some((kw) => m.includes(kw))) return "quente";
  if (sinaisMorno.some((kw) => m.includes(kw)))  return "morno";
  return "frio";
}

// ─── parseBudget ─────────────────────────────────────────────────────────────
function parseBudget(raw: string): string {
  const n = raw.replace(/r\$\s*/i, "").replace(/\./g, "").replace(",", ".");
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

  if (m.includes("hatch"))   updates.type = "Hatch";
  if (m.includes("sedan"))   updates.type = "Sedan";
  if (m.includes("suv"))     updates.type = "SUV";
  if (m.includes("pickup"))  updates.type = "Pickup";
  if (m.includes("caminho")) updates.type = "Caminhonete";

  if (m.includes("financ"))                            updates.payment = "Financiado";
  if (m.includes("à vista") || m.includes("avista") || m.includes("a vista")) updates.payment = "À Vista";
  if (m.includes("consórcio") || m.includes("consorcio")) updates.payment = "Consórcio";

  const nameMatch = message.match(/(?:meu nome é|me chamo|sou o|sou a)\s+([A-ZÀ-Úa-zà-ú]+)/i);
  if (nameMatch) updates.name = nameMatch[1];

  return updates;
}
