/**
 * 🧠 leadIntel.ts — inteligência de lead (comprador real x curioso)
 *
 * Lê a conversa do lead, pede ao Groq um perfil estruturado (intenção, pagamento,
 * troca, urgência, visita, objeções, próximo passo) e grava em `leads`.
 * Se a IA falhar ou não houver GROQ_API_KEY, devolve null e o webhook segue
 * com o score por palavra-chave (calcLeadScore).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LeadIntent      = "comprador" | "interessado" | "curioso" | "sem_interesse" | "outro";
export type LeadTemperature = "quente" | "morno" | "frio";

export type LeadProfile = {
  intent:           LeadIntent;
  score:            number;
  vehicle_interest: string | null;
  budget_ok:        boolean | null;
  payment:          "avista" | "financiado" | "consorcio" | "troca" | null;
  has_trade_in:     boolean | null;
  trade_in:         string | null;
  down_payment:     number | null;
  urgency:          "hoje" | "semana" | "mes" | "sem_pressa" | null;
  visit_intent:     boolean | null;
  objections:       string[];
  summary:          string;
  next_action:      string;
};

const INTENTS: LeadIntent[] = ["comprador", "interessado", "curioso", "sem_interesse", "outro"];

// ── Veículo do anúncio ───────────────────────────────────────────────────────
export type AdVehicle = { id: string | null; label: string };

/** Descobre o carro de um anúncio: tabela meta_ads primeiro, depois casa marca+modelo+ano no texto. */
export async function resolveAdVehicle(
  adId:  string,
  title: string | null,
  body:  string | null,
): Promise<AdVehicle | null> {
  try {
    const { data: mapped } = await supabaseAdmin
      .from("meta_ads").select("vehicle_id, vehicle_label").eq("ad_id", adId).maybeSingle();
    if (mapped?.vehicle_label) return { id: mapped.vehicle_id ?? null, label: mapped.vehicle_label };

    const haystack = `${title ?? ""} ${body ?? ""}`.toLowerCase();
    if (!haystack.trim()) return null;

    const { data: vehicles } = await supabaseAdmin
      .from("vehicles").select("id, brand, model, year").eq("status", "disponivel");
    const matches = (vehicles ?? []).filter((v) => {
      const brand = String(v.brand ?? "").trim().toLowerCase();
      const word  = String(v.model ?? "").trim().toLowerCase().split(/\s+/)[0];
      const year  = v.year ? String(v.year) : "";
      return brand && word && haystack.includes(brand) && haystack.includes(word) && (!year || haystack.includes(year));
    });
    if (matches.length !== 1) return null;
    const v = matches[0];
    return { id: v.id, label: `${v.brand} ${String(v.model).trim()} ${v.year ?? ""}`.trim() };
  } catch {
    return null;
  }
}

// ── Groq (JSON) ──────────────────────────────────────────────────────────────
async function callGroqJSON(system: string, user: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const body = (withFormat: boolean) => JSON.stringify({
    model:            process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    temperature:      0.1,
    max_tokens:       1500,
    reasoning_effort: "low",
    ...(withFormat ? { response_format: { type: "json_object" } } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
  });

  for (const withFormat of [true, false]) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body:    body(withFormat),
      signal:  AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const data = await res.json() as { choices: { message: { content: string } }[] };
      return data.choices[0]?.message?.content ?? null;
    }
    console.error(`[INTEL] Groq ${res.status} (json_mode:${withFormat}):`, (await res.text()).slice(0, 200));
  }
  return null;
}

const SYSTEM = `Você analisa conversas de WhatsApp de uma loja de carros seminovos (PHD Motors, Fortaleza) e diz se o cliente é um COMPRADOR REAL ou só um CURIOSO. Responda APENAS com um objeto JSON, sem texto fora dele.

CONTEXTO
- O cliente chegou por anúncio. O botão do anúncio envia a frase automática "Quero comprar meu veículo: <carro>". Ela NÃO indica intenção: todo mundo manda.
- No anúncio ele também vê 3 perguntas: (1) o valor está dentro do que pretende investir? (2) à vista ou financiado? (3) tem carro na troca?
- Alguns anúncios têm botões de resposta: "Quero ver o <carro> hoje", "Quero simular o financiamento", "Tenho um carro na troca", "Pago à vista e quero negociar". Quem toca num botão escolheu uma ação concreta: isso é sinal moderado (interessado, score 45 a 59), não prova de comprador pronto; vira comprador se depois confirmar valor, pagamento ou horário de visita.
- Julgue só pelo que o CLIENTE escreveu. O que o Vendedor diz não conta como sinal do cliente.
- Cliente que só tocou em botão ("Pago à vista", "Quero ver o carro hoje", "Tenho um carro na troca") e nunca escreveu nada próprio NÃO é comprador: no máximo "interessado", score até 45.

INTENÇÃO (intent)
- "comprador": quer comprar e dá sinais concretos (aceitou o valor, disse como vai pagar, falou de entrada/troca, quer visitar, pediu simulação, pediu para reservar).
- "interessado": está avaliando, pergunta detalhes do carro (km, ano, fotos, documentação), mas ainda sem forma de pagamento nem prazo.
- "curioso": só perguntou preço ou "ainda disponível?", não respondeu as perguntas, mandou só a frase automática, sumiu, ou compara sem engajar.
- "sem_interesse": engano, já comprou, achou caro e saiu, pediu para parar.
- "outro": revendedor, concorrente, spam, alguém oferecendo serviço.

SCORE (0 a 100)
- 0-20 curioso; 21-40 interessado frio; 41-59 interessado morno (informou pagamento OU aceitou valor OU pediu detalhes específicos);
- 60-79 comprador provável (aceitou valor E informou pagamento/entrada/troca, ou quer visitar);
- 80-100 comprador pronto (agendou ou quer ir hoje, mandou CPF para simulação, pediu para reservar/fechar).
- "sem_interesse" e "outro": no máximo 10.

JSON (todos os campos obrigatórios; use null quando não souber):
{"intent":"comprador|interessado|curioso|sem_interesse|outro","score":0,"vehicle_interest":"carro que ele quer ou null","budget_ok":true|false|null,"payment":"avista|financiado|consorcio|troca|null","has_trade_in":true|false|null,"trade_in":"modelo/ano do carro da troca ou null","down_payment":número em reais ou null,"urgency":"hoje|semana|mes|sem_pressa|null","visit_intent":true|false|null,"objections":["objeções citadas"],"summary":"1 ou 2 frases sobre quem é o cliente e o que quer","next_action":"1 frase com o próximo passo do vendedor"}`;

// ── Validação ────────────────────────────────────────────────────────────────
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function boolOrNull(v: unknown): boolean | null { return typeof v === "boolean" ? v : null; }
function text(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export function parseProfile(raw: string): LeadProfile | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }

  const intent = oneOf(j.intent, INTENTS);
  const scoreN = Number(j.score);
  if (!intent || !Number.isFinite(scoreN)) return null;

  let score = Math.max(0, Math.min(100, Math.round(scoreN)));
  if (intent === "sem_interesse" || intent === "outro") score = Math.min(score, 10);
  if (intent === "curioso") score = Math.min(score, 25);

  const down = Number(j.down_payment);
  return {
    intent,
    score,
    vehicle_interest: text(j.vehicle_interest, 80),
    budget_ok:        boolOrNull(j.budget_ok),
    payment:          oneOf(j.payment, ["avista", "financiado", "consorcio", "troca"] as const),
    has_trade_in:     boolOrNull(j.has_trade_in),
    trade_in:         text(j.trade_in, 80),
    down_payment:     Number.isFinite(down) && down > 0 ? Math.round(down) : null,
    urgency:          oneOf(j.urgency, ["hoje", "semana", "mes", "sem_pressa"] as const),
    visit_intent:     boolOrNull(j.visit_intent),
    objections:       Array.isArray(j.objections)
      ? j.objections.filter((o): o is string => typeof o === "string").map(o => o.slice(0, 80)).slice(0, 5)
      : [],
    summary:          text(j.summary, 300) ?? "",
    next_action:      text(j.next_action, 200) ?? "",
  };
}

export function temperatureFromScore(score: number, intent: LeadIntent): LeadTemperature {
  if (intent === "curioso" || intent === "sem_interesse" || intent === "outro") return "frio";
  if (score >= 60) return "quente";
  if (score >= 35) return "morno";
  return "frio";
}

// ── Análise ──────────────────────────────────────────────────────────────────
export async function analyzeLead(leadId: string): Promise<LeadProfile | null> {
  if (!process.env.GROQ_API_KEY) return null;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("name, ad_headline, vehicle_name, veiculo_interesse_id")
    .eq("id", leadId).maybeSingle();
  if (!lead) return null;

  const { data: msgs } = await supabaseAdmin
    .from("messages").select("text, from_me")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(30);
  const ordered = (msgs ?? []).filter(m => (m.text ?? "").trim()).reverse();
  if (ordered.length === 0) return null;

  let carro = lead.vehicle_name ?? "não identificado";
  if (lead.veiculo_interesse_id) {
    const { data: v } = await supabaseAdmin
      .from("vehicles").select("brand, model, year, price, km")
      .eq("id", lead.veiculo_interesse_id).maybeSingle();
    if (v) {
      carro = `${v.brand} ${String(v.model).trim()} ${v.year ?? ""} — R$ ${Number(v.price ?? 0).toLocaleString("pt-BR")} — ${Number(v.km ?? 0).toLocaleString("pt-BR")} km`;
    }
  }

  const transcript = ordered
    .map(m => `${m.from_me ? "Vendedor" : "Cliente"}: ${(m.text ?? "").replace(/\s+/g, " ").slice(0, 400)}`)
    .join("\n");

  const user =
    `Carro do anúncio: ${carro}\n` +
    `Título do anúncio: ${lead.ad_headline ?? "—"}\n\n` +
    `CONVERSA (mais antiga primeiro):\n${transcript}`;

  const raw = await callGroqJSON(SYSTEM, user);
  if (!raw) return null;
  const profile = parseProfile(raw);
  if (!profile) console.error("[INTEL] JSON inválido:", raw.slice(0, 200));
  return profile ? capButtonOnlyLead(profile, ordered) : profile;
}

// ── Toque em botão não é prova de compra ─────────────────────────────────────
/** Frases que o WhatsApp envia sozinho quando o cliente toca num botão do anúncio, e cumprimentos soltos. */
const NON_SUBSTANTIVE_RE =
  /^(quero comprar meu ve[ií]culo\b|quero ver (a|o) .{0,50} hoje|quero simular (o )?financiamento|tenho (um )?(carro|ve[ií]culo) na troca|pago [àa] vista|tenho interesse|ol[aá]!? ?quero\b|(oi|ol[aá]|bom dia|boa tarde|boa noite|ok|top|blz|beleza|sim|tudo bem)[!?. ]*$)/i;

export function isNonSubstantive(text: string | null | undefined): boolean {
  return NON_SUBSTANTIVE_RE.test((text ?? "").trim());
}

/** Se o cliente só tocou em botões/cumprimentou (nunca escreveu algo próprio), o score não passa de 45 e ele não é "comprador". */
export function capButtonOnlyLead(
  profile: LeadProfile,
  msgs: { text: string | null; from_me: boolean | null }[],
): LeadProfile {
  const substantive = msgs.filter((m) => !m.from_me && !isNonSubstantive(m.text)).length;
  if (substantive > 0) return profile;
  const capped: LeadProfile = { ...profile, score: Math.min(profile.score, 45) };
  if (capped.intent === "comprador") capped.intent = "interessado";
  capped.summary = `${capped.summary} (só tocou em botão do anúncio, ainda sem escrever)`.slice(0, 300);
  return capped;
}

const PAYMENT_LABEL: Record<string, string> = {
  avista: "À Vista", financiado: "Financiado", consorcio: "Consórcio", troca: "Troca",
};

/** Grava o perfil no lead. `score` e `qualification` passam a refletir a análise. */
export async function applyProfile(
  leadId:         string,
  profile:        LeadProfile,
  currentPayment: string | null,
): Promise<{ score: number; temperature: LeadTemperature }> {
  const temperature = temperatureFromScore(profile.score, profile.intent);
  const upd: Record<string, unknown> = {
    ai_profile:     profile,
    ai_summary:     profile.summary,
    ai_temperature: temperature,
    ai_intent:      profile.intent,
    ai_score:       profile.score,
    ai_analyzed_at: new Date().toISOString(),
    score:          profile.score,
    qualification:  temperature,
  };
  if (!currentPayment && profile.payment) upd.payment = PAYMENT_LABEL[profile.payment];
  await supabaseAdmin.from("leads").update(upd).eq("id", leadId);
  return { score: profile.score, temperature };
}
