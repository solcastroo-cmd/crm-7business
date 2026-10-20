export type RadarIntent = "comprador" | "interessado" | "curioso" | "sem_interesse" | "outro";

export type Classified = {
  id: string;
  intent: RadarIntent;
  score: number;
  vehicle_hint: string | null;
  summary: string | null;
  next_step: string | null;
};

export type ClassifyInput = { id: string; username: string; text: string; context?: string | null };

const INTENTS: RadarIntent[] = ["comprador", "interessado", "curioso", "sem_interesse", "outro"];

export function temperatureFromScore(score: number): "quente" | "morno" | "frio" {
  return score >= 60 ? "quente" : score >= 35 ? "morno" : "frio";
}

const SYSTEM = `Você analisa comentários e mensagens diretas do Instagram da PHD Motors, loja de carros seminovos em Fortaleza, e diz quais pessoas são POSSÍVEIS COMPRADORES. Responda APENAS com um objeto JSON: {"items":[...]} com um item por entrada, mantendo o mesmo "id".

INTENÇÃO (intent)
- "comprador": quer comprar e dá sinal concreto (pergunta como financiar, entrada, troca, quer visitar, pede para reservar, "quero esse").
- "interessado": pergunta preço/valor, "ainda disponível?", km, ano, onde fica, condições. Ainda sem prazo ou pagamento.
- "curioso": só elogio, emoji, "lindo", "top", marcou amigo, comentário genérico sem pergunta.
- "sem_interesse": engano, reclamação, pediu para parar.
- "outro": spam, divulgação, concorrente, vendedor oferecendo serviço, golpe.

SCORE (0 a 100): curioso 0-20; interessado 30-59 (pergunta de valor ~45); comprador 60-100 (quer visitar/financiar/fechar 70-90). "sem_interesse" e "outro" no máximo 10.

Cada item: {"id":"...","intent":"...","score":0,"vehicle_hint":"carro citado ou null","summary":"1 frase sobre quem é e o que quer","next_step":"1 frase com o próximo passo do vendedor"}`;

function heuristic(text: string): Pick<Classified, "intent" | "score"> {
  const t = text.toLowerCase();
  if (/(financ|entrada|parcel|troca|visita|reserv|quero esse|quero comprar|fechar)/.test(t)) return { intent: "comprador", score: 65 };
  if (/(valor|pre[cç]o|quanto|dispon[ií]vel|ainda tem|km|ano|onde fica|endere[cç]o|aceita)/.test(t)) return { intent: "interessado", score: 45 };
  return { intent: "curioso", score: 12 };
}

async function callGroq(user: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.1,
      max_tokens: 3000,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? null;
}

export async function classifyBatch(items: ClassifyInput[]): Promise<Map<string, Classified>> {
  const out = new Map<string, Classified>();
  for (let i = 0; i < items.length; i += 12) {
    const chunk = items.slice(i, i + 12);
    const user = chunk
      .map(c => `id=${c.id} | @${c.username}${c.context ? ` | post: ${c.context.replace(/\s+/g, " ").slice(0, 160)}` : ""}\ntexto: ${c.text.replace(/\s+/g, " ").slice(0, 500)}`)
      .join("\n\n");
    let parsed: Record<string, unknown>[] = [];
    try {
      const raw = await callGroq(user);
      const obj = raw ? (JSON.parse(raw) as { items?: Record<string, unknown>[] }) : null;
      parsed = Array.isArray(obj?.items) ? obj!.items! : [];
    } catch {
      parsed = [];
    }
    for (const c of chunk) {
      const p = parsed.find(x => x.id === c.id);
      const intent = INTENTS.includes(p?.intent as RadarIntent) ? (p!.intent as RadarIntent) : null;
      const score = typeof p?.score === "number" ? Math.max(0, Math.min(100, Math.round(p.score))) : null;
      if (p && intent && score !== null) {
        out.set(c.id, {
          id: c.id,
          intent,
          score,
          vehicle_hint: typeof p.vehicle_hint === "string" && p.vehicle_hint.trim() ? p.vehicle_hint.trim().slice(0, 120) : null,
          summary: typeof p.summary === "string" ? p.summary.slice(0, 300) : null,
          next_step: typeof p.next_step === "string" ? p.next_step.slice(0, 300) : null,
        });
      } else {
        const h = heuristic(c.text);
        out.set(c.id, { id: c.id, ...h, vehicle_hint: null, summary: null, next_step: null });
      }
    }
  }
  return out;
}
