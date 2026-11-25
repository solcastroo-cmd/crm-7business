/**
 * 📅 visitSlots.ts — próximos horários de visita à loja
 *
 * Horário da loja: segunda a sexta 9h–17h, sábado 9h–13h, domingo fechado.
 * As datas são calculadas aqui (e não pela IA) para nunca oferecer dia fechado ou hora passada.
 */

export const STORE_HOURS_TEXT = "segunda a sexta das 9h às 17h e sábado das 9h às 13h (domingo fechado)";

const DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fortaleza é UTC-3 o ano todo: devolve uma data cujos getters UTC são a hora local da loja */
function toLocal(now: Date): Date {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}

/** Abertura e fechamento do dia; null = fechado */
function hoursOf(local: Date): { open: number; close: number } | null {
  const dm = `${local.getUTCDate()}/${local.getUTCMonth() + 1}`;
  if (dm === "25/12" || dm === "1/1") return null;
  const dow = local.getUTCDay();
  if (dow === 0) return null;
  return { open: 9, close: dow === 6 ? 13 : 17 };
}

function dayLabel(local: Date, offset: number): string {
  if (offset === 0) return "hoje";
  const dow = DAYS[local.getUTCDay()];
  if (offset === 1) return `amanhã (${dow})`;
  return `${dow} (${String(local.getUTCDate()).padStart(2, "0")}/${String(local.getUTCMonth() + 1).padStart(2, "0")})`;
}

/** Os `count` dias abertos mais próximos, um horário por dia (última visita: 1h antes de fechar) */
export function nextVisitSlots(now: Date, count = 2): string[] {
  const local = toLocal(now);
  const slots: string[] = [];
  for (let offset = 0; offset < 14 && slots.length < count; offset++) {
    const day = new Date(local.getTime() + offset * DAY_MS);
    const h   = hoursOf(day);
    if (!h) continue;
    let hour = 10;
    if (offset === 0) {
      // Hoje: pelo menos 30 min para o cliente chegar, arredondando para a hora cheia
      hour = Math.max(h.open, Math.ceil(local.getUTCHours() + local.getUTCMinutes() / 60 + 0.5));
      if (hour > h.close - 1) continue;
    }
    slots.push(`${dayLabel(day, offset)} às ${hour}h`);
  }
  return slots;
}

/** Bloco do prompt com a data de agora e os próximos dias abertos */
export function visitContext(now: Date): string {
  const local = toLocal(now);
  const days: string[] = [];
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(local.getTime() + offset * DAY_MS);
    const h   = hoursOf(day);
    if (!h) continue;
    if (offset === 0 && local.getUTCHours() >= h.close - 1) continue;
    days.push(`${dayLabel(day, offset)}: ${h.open}h às ${h.close}h`);
  }
  const [a, b] = nextVisitSlots(now);
  const hhmm = `${local.getUTCHours()}h${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return (
    `\n\n--- AGENDA DE VISITAS ---\n` +
    `Agora em Fortaleza: ${DAYS[local.getUTCDay()]}, ${local.getUTCDate()}/${local.getUTCMonth() + 1}, ${hhmm}\n` +
    `Funcionamento: ${STORE_HOURS_TEXT}\n` +
    `OFEREÇA PRIMEIRO: ${[a, b].filter(Boolean).join(" ou ")}\n` +
    `Próximos dias abertos: ${days.join("; ")}\n` +
    `Use só estas datas. Ignore datas oferecidas antes no histórico que já passaram.`
  );
}
