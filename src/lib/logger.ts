/**
 * 📋 logger.ts — Sistema de logging unificado do CRM 7Business
 *
 * Verboso por padrão em qualquer ambiente.
 * Todos os módulos WhatsApp usam logWA() para garantir
 * filtragem fácil nos logs do Railway com [WA:LEVEL].
 *
 * Uso:
 *   import { logWA } from "@/lib/logger";
 *   logWA("INFO",  "Token salvo", { userId, phone });
 *   logWA("ERROR", "Falha ao enviar", { code: 190, msg });
 *   logWA("RECV",  "Mensagem recebida", body);
 *   logWA("SEND",  "Resposta Meta", { status: 200 });
 */

// ── Níveis disponíveis ────────────────────────────────────────────────────────
export type LogLevel =
  | "INFO"    // operações normais
  | "WARN"    // situações inesperadas mas recuperáveis
  | "ERROR"   // falhas que precisam de atenção
  | "DEBUG"   // detalhes internos (sempre ligado)
  | "RECV"    // payload recebido da Meta
  | "SEND"    // payload enviado para a Meta / resposta
  | "CRON"    // tarefas agendadas
  | "MIGRATE" // migration de banco
  | "AUTH";   // fluxo OAuth

// ── Emojis por nível ──────────────────────────────────────────────────────────
const EMOJI: Record<LogLevel, string> = {
  INFO:    "ℹ️ ",
  WARN:    "⚠️ ",
  ERROR:   "❌",
  DEBUG:   "🔍",
  RECV:    "📨",
  SEND:    "📤",
  CRON:    "⏰",
  MIGRATE: "🗄️ ",
  AUTH:    "🔐",
};

// ── Máximo de caracteres no JSON dos dados ────────────────────────────────────
const MAX_DATA_LEN = 2000;

// ─────────────────────────────────────────────────────────────────────────────
/**
 * logWA — função principal de logging do módulo WhatsApp.
 *
 * @param level   - Nível do log (INFO, WARN, ERROR, DEBUG, RECV, SEND...)
 * @param message - Descrição humana da operação
 * @param data    - Objeto opcional com detalhes (será JSON.stringify)
 */
export function logWA(level: LogLevel, message: string, data?: unknown): void {
  const ts      = new Date().toISOString();
  const emoji   = EMOJI[level] ?? "📋";
  const prefix  = `[WA:${level}]`;

  let dataPart = "";
  if (data !== undefined) {
    try {
      const raw = JSON.stringify(data, null, 0);
      dataPart  = raw.length > MAX_DATA_LEN
        ? ` ${raw.substring(0, MAX_DATA_LEN)}… (truncado ${raw.length} chars)`
        : ` ${raw}`;
    } catch {
      dataPart = " [não serializável]";
    }
  }

  const line = `${ts} ${emoji} ${prefix} ${message}${dataPart}`;

  switch (level) {
    case "ERROR":
      console.error(line);
      break;
    case "WARN":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

// ── Atalhos semânticos ────────────────────────────────────────────────────────
export const waInfo    = (msg: string, data?: unknown) => logWA("INFO",    msg, data);
export const waWarn    = (msg: string, data?: unknown) => logWA("WARN",    msg, data);
export const waError   = (msg: string, data?: unknown) => logWA("ERROR",   msg, data);
export const waDebug   = (msg: string, data?: unknown) => logWA("DEBUG",   msg, data);
export const waRecv    = (msg: string, data?: unknown) => logWA("RECV",    msg, data);
export const waSend    = (msg: string, data?: unknown) => logWA("SEND",    msg, data);
export const waCron    = (msg: string, data?: unknown) => logWA("CRON",    msg, data);
export const waMigrate = (msg: string, data?: unknown) => logWA("MIGRATE", msg, data);
export const waAuth    = (msg: string, data?: unknown) => logWA("AUTH",    msg, data);
