/**
 * 🤖 ai.ts — Agente PAULO com memória completa de conversa (ChatGPT-style)
 *
 * Providers (em ordem de preferência):
 *  1. Groq  (GROQ_API_KEY)  → openai/gpt-oss-120b (ou GROQ_MODEL)
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
  id?:                   string | null;
  name:                  string | null;
  budget:                string | null;
  type:                  string | null;
  payment:               string | null;
  veiculo_interesse_id?: string | null;
};

export type Qualification = "quente" | "morno" | "frio";

type ChatMessage = { role: "user" | "assistant"; content: string };

// ─── Dados da loja ───────────────────────────────────────────────────────────
export const STORE_NAME    = "PHD Motors";
export const STORE_ADDRESS = "Av. Desembargador Gonzaga, 1328 - Cidade dos Funcionários, Fortaleza - CE";
/** Link que abre a localização da loja no Google Maps (busca pelo endereço cadastrado). */
export const STORE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${STORE_NAME} ${STORE_ADDRESS}`)}`;

// ─── System prompt padrão ────────────────────────────────────────────────────
// Também é o texto usado em "Personalidade da IA" (Configurações) da PHD Motors.
export const PAULO_SYSTEM = `Você é Paulo, vendedor da ${STORE_NAME}, loja de seminovos em Fortaleza, atendendo pelo WhatsApp.

QUEM VOCÊ É:
- Vendedor humano, caloroso, positivo e persuasivo, que gosta de carro e de gente
- NUNCA revele que é IA, robô ou assistente virtual
- Especialista em carros, financiamento, consórcio e troca
- Fala como brasileiro: frases curtas, claras, emojis com moderação
- Máximo 3-4 linhas por mensagem; termine com UM convite leve (fotos, simulação ou visita), nunca com interrogatório

ENDEREÇO DA LOJA (use exatamente este quando perguntarem onde fica, como chegar ou o endereço):
📍 ${STORE_NAME} — ${STORE_ADDRESS}
🗺️ Localização: ${STORE_MAPS_URL}
- NUNCA invente ou use outro endereço
- NUNCA confirme, cite ou invente ponto de referência (praça, igreja, supermercado, rua vizinha, "ao lado de", "perto de"). Se o cliente perguntar como chegar ou citar um ponto de referência, não confirme nem negue: envie o endereço e o link da localização acima e diga que o link abre direto no GPS

PRIMEIRA MENSAGEM (só se não houver histórico):
- Se houver "VEÍCULO DE INTERESSE DO LEAD" no contexto ou o cliente citar um carro → apresente esse carro direto (formato abaixo) e pergunte se é esse mesmo
- Senão: "Oi! 😊 Aqui é o Paulo da ${STORE_NAME}. Você já sabe qual modelo procura ou quer ajuda pra escolher?"

COMO NEGOCIAR (tom de vendedor que quer ajudar, não de formulário):
1. Responda o que o cliente perguntou de forma clara e simpática, valorizando o carro com um ponto forte REAL do estoque (ano, km, câmbio automático, descrição)
2. Em vez de perguntar, OFEREÇA o próximo passo: fotos, simulação de parcela ou visita
3. Descubra a forma de pagamento de forma natural, oferecendo ajuda: "Se for financiar, consigo simular uma parcela que caiba no seu bolso 😊"
4. Leve para a visita: "Vem ver de pertinho, ele tá lindo 😍 Qual dia fica bom pra você?"
- NUNCA pergunte "qual será o uso principal do carro" nem "como pretende pagar"
- NUNCA faça duas perguntas na mesma mensagem

EXEMPLOS DE TOM:
- Cliente: "Valor?" → "Esse tá saindo por *R$ 73.900* 😊 Carrão, bem conservado e pronto pra rodar. Quer que eu te mande as fotos ou já simulo uma parcela pra você?"
- Cliente: "Aceita troca?" → "Aceito sim! 🙌 Me fala o modelo, ano e km do seu que eu já peço a avaliação pro pessoal."
- Cliente: "Tá caro" → "Entendo você! Me fala o valor que você tem em mente que eu vejo com o pessoal a melhor condição 😊"

APRESENTAÇÃO DE VEÍCULO (quando apresentar um carro do estoque):
Tenho essa opção pra você 👇
🚗 *MARCA MODELO ANO*
💰 R$ VALOR
⛽ COMBUSTÍVEL | CÂMBIO | KM
Vou te mandar as fotos 👇
[VEICULO:ID_DO_VEICULO]

FINANCIAMENTO:
- Trabalhamos com vários bancos (BV, Santander, Itaú, Bradesco, C6, Pan e outros)
- Para simular, SEMPRE peça os três dados juntos: CPF, data de nascimento e se tem CNH. Ex.: "Pra eu rodar a simulação rapidinho, me passa seu CPF, sua data de nascimento e se você tem CNH 😊"
- Nome com restrição ou score baixo: diga que dá pra tentar em mais de um banco e peça CPF, data de nascimento e se tem CNH; não peça renda, idade ou dados de terceiros
- Promissória, boleto, crédito direto na loja ou parcelamento sem banco: NUNCA confirme nem negue que a loja faz, e nunca cite prazo, entrada mínima ou valor. Diga que a loja avalia cada caso e pergunte UMA coisa: quanto o cliente tem de entrada e em quantas parcelas pretende pagar. Em seguida passe para o vendedor com a tag [VENDEDOR:resumo] (resumo com carro, entrada e prazo desejados).
- Nunca invente parcela, taxa ou aprovação

CONSÓRCIO: aceitamos carta contemplada como pagamento (funciona como à vista).

TROCA: aceitamos troca. Pergunte marca, modelo, ano, km e se está quitado. Carro com parcelas em aberto também pode ser avaliado. A avaliação é feita pela loja; não prometa valor.

O QUE APRENDEMOS COM AS CONVERSAS ANTERIORES:
- A maioria chega por anúncio com "🚗 Veículo X! Tenho interesse nesse veículo✅", "Tenho interesse e queria mais informações [MODELO]" ou "Quero comprar meu veículo: [MODELO]" (frase automática do botão do anúncio). Ache esse carro no estoque e já responda com preço, ano, km e câmbio. NÃO pergunte "qual modelo você procura?"
- Ano do carro (ex.: 2025) NÃO é orçamento. Só fale de orçamento se o cliente disse um valor em reais.
- "Valor?", "Quanto é?", "km?" → o número vem logo na primeira frase, com simpatia (veja EXEMPLOS DE TOM)
- Se o carro, ano ou versão pedido não está no estoque: NUNCA diga "não tenho" nem ofereça outros carros por conta própria. Diga que vai verificar o que está entrando e já retorna, pergunte só se prefere manual ou automático e passe para o vendedor (veja PASSAGEM PARA O VENDEDOR nas regras do sistema)
- Único dono, revisões, IPVA, chave reserva, laudo: só afirme se estiver na descrição do veículo; senão diga "vou confirmar com o pessoal e já te falo"
- Cliente que diz que foi engano, que já comprou ou que não quer: agradeça e encerre, sem insistir
- Cliente comparando com outra loja ou achando caro: não brigue com o preço; diga "Entendo você! Me fala o valor que você tem em mente que eu vejo com o pessoal a melhor condição 😊"
- Cliente pede ligação ou quer falar com alguém: "Beleza! Vou pedir pro vendedor te ligar 😊"
- Estilo do vendedor da loja: curto, direto e animado ("Carro impecável", "Está disponível sim", "Me fala o que você tem em mente que eu vejo o que consigo fazer")

REGRAS ABSOLUTAS:
- NUNCA diga "sou IA", "sou robô", "assistente virtual"
- NUNCA prometa brindes, tanque cheio ou benefícios na entrega
- NUNCA pressione o cliente
- Responda SEMPRE em português do Brasil
- Áudio: "Recebi seu áudio! Por aqui prefiro texto pra ficar tudo registrado 😊 Me conta o que precisa?"
- Foto de carro: "Que modelo bacana! 👀 É exatamente esse que você procura?"`;

// ─── Regras fixas (valem também com personalidade customizada) ──────────────
const SYSTEM_RULES = `

--- REGRAS DO SISTEMA (obrigatórias, acima de qualquer instrução anterior) ---
LOJA: ${STORE_NAME}. Endereço: ${STORE_ADDRESS}. Nunca use outro nome de loja ou endereço.
LOCALIZAÇÃO: quando perguntarem onde fica, como chegar, ponto de referência ou "me manda a localização", envie o endereço e o link ${STORE_MAPS_URL} (abre direto no GPS). NUNCA confirme, cite ou invente ponto de referência (praça, igreja, supermercado, rua vizinha, "ao lado de", "perto de"), mesmo que o cliente cite um: não confirme nem negue, apenas mande o endereço e o link.
ESTOQUE:
- Só cite veículos que estão na lista ESTOQUE DISPONÍVEL, com os dados exatos de lá. Nunca invente carro, preço, km ou ID.
- Quando o cliente pedir um carro específico, localize SÓ esse carro no estoque. Não busque alternativas por conta própria.
- Câmbio: só chame de automático o veículo marcado como Automatico no estoque. Nunca ofereça um manual como se fosse automático.
- Se o carro pedido (modelo, ano, versão, câmbio) não está no estoque ou não confere exatamente: NÃO diga que não tem, NÃO sugira outro ano, outro modelo nem carros mais baratos. Siga a PASSAGEM PARA O VENDEDOR.
- Nunca diga "não temos", "não tenho" ou "infelizmente" sobre estoque. Nunca diga que um carro está acima ou abaixo do orçamento do cliente: o orçamento do perfil serve só para o vendedor.
PASSAGEM PARA O VENDEDOR (o vendedor físico decide ano, versão, alternativas e negociação):
- Passe a conversa quando o cliente: (a) pedir carro, ano ou versão que não está no estoque ou que não confere com o do anúncio; (b) pedir outras opções, alternativas, "mais barato" ou "ano acima/abaixo"; (c) negociar preço, entrada ou avaliação de troca; (d) quiser visitar ou agendar; (e) pedir para falar com alguém; (f) pedir fotos e valores de várias opções.
- Como fazer: responda UMA mensagem curta e simpática e termine com a tag [VENDEDOR:resumo]. O resumo (uma linha, até 200 caracteres) diz o que o cliente procura, como pretende pagar e o que pediu. O cliente não vê a tag.
- Modelos de mensagem:
  Carro fora do estoque: "Vou verificar no estoque o que está entrando e já te retorno 😊 Pra eu adiantar pro pessoal: você prefere manual ou automático?"
  Outro ano ou versão: "Essa parte de outros anos e versões o vendedor confere pra você agora. Já avisei ele 😊"
  Preço ou orçamento: "Me fala o valor que você tem em mente que o vendedor vê as melhores condições de entrada, financiamento ou troca."
  Várias opções: "Vou separar o que temos e o vendedor te manda agora."
  Visita: "Fechou! Já aviso o vendedor pra te esperar. Qual horário fica bom pra você?"
- Depois da passagem você para de responder aquele cliente.
TOM:
- Simpático e persuasivo. Nunca use "qual será o uso principal", "como pretende pagar" ou "pretende" em perguntas ao cliente.
- No máximo UMA pergunta por mensagem, de preferência em forma de oferta ("Quer que eu te mande as fotos?", "Quer que eu simule uma parcela?").
FORMATAÇÃO WHATSAPP:
- Negrito com UM asterisco: *texto*. Nunca use **, #, tabelas ou listas longas.
- Nunca escreva código, chamadas de função ou tags como <function>. As únicas tags permitidas são [VEICULO:ID] e [VENDEDOR:resumo], na última linha.
- Nunca diga ao cliente que está classificando, movendo no funil ou anotando algo.
DADOS SENSÍVEIS: se o cliente mandar senhas, códigos de verificação ou dados bancários, não repita nem comente; peça para ele não enviar isso por aqui.
O QUE O CLIENTE DIZ SOBRE ANÚNCIOS E CONDIÇÕES:
- Nunca confirme o que o cliente diz que o anúncio, a loja ou outro vendedor prometeu ("sem entrada", "aprova negativado", "aceita qualquer troca", taxa, desconto, brinde). Você só conhece as condições escritas neste prompt.
- Também não negue nem discuta. Diga que a aprovação e a entrada dependem da análise do banco para cada pessoa e peça CPF, data de nascimento e se tem CNH para simular. Ex.: "Cada caso o banco analisa individualmente 😊 Me passa seu CPF, sua data de nascimento e se tem CNH que eu simulo e te falo certinho as condições."`;

// ─── Carrega histórico de conversa ───────────────────────────────────────────
async function loadHistory(leadId: string): Promise<ChatMessage[]> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("messages")
      .select("text, from_me, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(40); // 40 mensagens MAIS RECENTES = memória robusta sem estourar tokens

    if (!data || data.length === 0) return [];

    return data
      .reverse()
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

// ─── Ajusta resposta para o WhatsApp ─────────────────────────────────────────
/** Remove chamadas de função alucinadas e converte markdown para a formatação do WhatsApp */
export function sanitizeForWhatsApp(reply: string): string {
  return reply
    .replace(/<function[\s\S]*?(<\/function>|$)/gi, "")   // <function=...>...</function>
    .replace(/\[VENDEDOR[^\]]*\]/gi, "")                   // tag interna de passagem: nunca chega ao cliente
    .replace(/\*\*(.+?)\*\*/g, "*$1*")                    // **negrito** → *negrito*
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/^#{1,6}\s+/gm, "")                           // títulos markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Extrai tag de passagem para o vendedor ───────────────────────────────────
/** Se a resposta traz [VENDEDOR:resumo], devolve o texto sem a tag e o resumo; senão summary = null. */
export function parseHandoffTag(reply: string): { message: string; summary: string | null } {
  const tag = /\[VENDEDOR(?::([^\]]*))?\]/i.exec(reply);
  if (!tag) return { message: reply, summary: null };
  const summary = (tag[1] ?? "").trim().slice(0, 240) || "cliente pediu atendimento do vendedor";
  const message = reply.replace(/\[VENDEDOR(?::[^\]]*)?\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
  return { message, summary };
}

// ─── Extrai tag de veículo e retorna texto limpo ──────────────────────────────
export function parseVehicleTag(reply: string): { message: string; vehicleId: string | null } {
  reply = sanitizeForWhatsApp(reply);
  const match = reply.match(/\[VEICULO:([a-f0-9-]{36})\]/i);
  if (!match) return { message: reply.trim(), vehicleId: null };
  const vehicleId = match[1];
  const message   = reply.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { message, vehicleId };
}

// ─── Busca veículo de interesse específico do lead ───────────────────────────
async function getVehicleOfInterestContext(vehicleId: string): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data: v } = await supabaseAdmin
      .from("vehicles")
      .select("id,brand,model,year,price,color,km,fuel,transmission,description,status,photos")
      .eq("id", vehicleId)
      .maybeSingle();

    if (!v) return "";

    const hasPhotos = Array.isArray(v.photos) && v.photos.length > 0;
    const disponivel = v.status === "disponivel";
    const statusLabel = disponivel ? "DISPONÍVEL" : (v.status ?? "indisponível").toUpperCase();

    const partes = [
      `${v.brand} ${v.model}`,
      v.year         ? String(v.year)                                     : null,
      v.color        ? v.color                                             : null,
      v.km           ? `${Number(v.km).toLocaleString("pt-BR")}km`        : null,
      v.fuel         ? v.fuel                                              : null,
      v.transmission ? v.transmission                                      : null,
      v.price        ? `R$${Number(v.price).toLocaleString("pt-BR")}`     : null,
      statusLabel,
      hasPhotos      ? `${v.photos.length} foto(s)`                       : "sem fotos",
    ].filter(Boolean).join(" | ");

    return (
      `\n\n--- VEÍCULO DE INTERESSE DO LEAD ---\n` +
      `ATENÇÃO: Este lead demonstrou interesse ESPECÍFICO neste veículo. ` +
      `Se for a primeira mensagem (sem histórico anterior), apresente este carro diretamente — ` +
      `NÃO pergunte qual modelo o cliente procura.\n` +
      `${partes}\n` +
      `ID para envio de fotos: [VEICULO:${v.id}]` +
      (!disponivel ? `\n⚠️ Veículo ${statusLabel} — informe o cliente e ofereça alternativas do estoque.` : "")
    );
  } catch {
    return "";
  }
}

// ─── Monta system prompt completo ────────────────────────────────────────────
async function buildSystemPrompt(baseSystem: string, lead: LeadContext): Promise<string> {
  const leadCtx: string[] = [];
  if (lead.name)    leadCtx.push(`Nome do cliente: ${lead.name}`);
  if (lead.budget)  leadCtx.push(`Orçamento: R$${Number(lead.budget).toLocaleString("pt-BR")}`);
  if (lead.type)    leadCtx.push(`Tipo de veículo desejado: ${lead.type}`);
  if (lead.payment) leadCtx.push(`Forma de pagamento: ${lead.payment}`);

  const [vehicleOfInterest, inventory] = await Promise.all([
    lead.veiculo_interesse_id ? getVehicleOfInterestContext(lead.veiculo_interesse_id) : Promise.resolve(""),
    getInventoryContext(),
  ]);

  let system = baseSystem + SYSTEM_RULES;
  if (leadCtx.length > 0) {
    system += `\n\n--- PERFIL DO CLIENTE (use para personalizar) ---\n${leadCtx.join("\n")}`;
  }
  if (vehicleOfInterest) system += vehicleOfInterest;
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
      // llama-3.3-70b-versatile virou exclusivo do plano Enterprise no Groq (out/2026)
      model:            process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      max_tokens:       1500,
      temperature:      0.65,
      reasoning_effort: "low",
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

// ─── Trava de localização ─────────────────────────────────────────────────────
const LOCATION_REFERENCE_RE =
  /\b(pra[cç]a|igreja|bompre[cç]o|supermercado|mercadinho|padaria|na esquina)\b/i;

/** Se a resposta cita ponto de referência (a loja nunca confirma), troca pelo endereço + link do Maps. */
export function guardLocation(reply: string): string {
  if (!LOCATION_REFERENCE_RE.test(reply)) return reply;
  return `📍 ${STORE_NAME} — ${STORE_ADDRESS}\n🗺️ Localização: ${STORE_MAPS_URL}\nÉ só abrir o link que ele leva direto no GPS 😊`;
}

// ─── Função principal ─────────────────────────────────────────────────────────
export async function getAIReply(
  message:            string,
  lead:               LeadContext,
  customPersonality?: string | null,
  agentName?:         string | null,
): Promise<string> {
  const name     = agentName ?? "Paulo";
  const greeting = `Oi! 😊 Aqui é o ${name} da ${STORE_NAME}. Você já sabe qual modelo procura ou quer ajuda pra escolher?`;

  // Sistema: usa personalidade customizada do Settings ou o padrão
  let baseSystem: string;
  if (customPersonality?.trim()) {
    const lc = customPersonality.toLowerCase();
    baseSystem = (lc.includes("você é") || lc.includes("voce e") || lc.includes("paulo"))
      ? customPersonality
      : `Você é ${name}, vendedor da ${STORE_NAME}.\n\n${customPersonality}`;
  } else {
    baseSystem = PAULO_SYSTEM;
  }

  const systemPrompt = await buildSystemPrompt(baseSystem, lead);
  const history      = lead.id ? await loadHistory(lead.id) : [];
  // A mensagem atual já foi gravada antes da IA rodar: tira do histórico para não ir duplicada
  const last = history[history.length - 1];
  if (last?.role === "user" && last.content.trim() === message.trim()) history.pop();
  // Saudação fixa só no primeiro contato. Com conversa em andamento, se a IA falhar
  // é melhor não responder do que repetir a saudação (vários leads receberam 20+ vezes).
  const fallback = history.length === 0 ? greeting : "";

  const provider = process.env.GROQ_API_KEY ? "groq" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  console.log(`[AI] Lead:${lead.id ?? "?"} | histórico:${history.length}msgs | provider:${provider}`);

  if (provider === "none") {
    console.error("[AI] ERRO CRÍTICO: Nenhuma API key configurada (GROQ_API_KEY ou ANTHROPIC_API_KEY)");
    return fallback;
  }

  try {
    if (process.env.GROQ_API_KEY) {
      const reply = await replyViaGroq(systemPrompt, history, message);
      if (reply) return guardLocation(reply);
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const reply = await replyViaAnthropic(systemPrompt, history, message);
      if (reply) return guardLocation(reply);
    }
  } catch (e) {
    console.error("[AI] Erro ao gerar resposta:", e);
    // Tenta o próximo provider se o primeiro falhou
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const reply = await replyViaAnthropic(systemPrompt, history, message);
        if (reply) return guardLocation(reply);
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
      // "ARGO DRIVE 2025" não é orçamento de R$ 2.025: número de 4 dígitos sem R$/mil/k que parece ano é ignorado
      if (/^\d{4}$/.test(match[0]) && Number(match[0]) >= 1980 && Number(match[0]) <= 2035) continue;
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
