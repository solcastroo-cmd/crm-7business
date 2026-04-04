/**
 * setup-env.js — Garante variáveis de ambiente mínimas após npm install
 *
 * Executado automaticamente via "postinstall" no package.json.
 * Apenas ADICIONA entradas faltantes ao .env.local — nunca sobrescreve.
 *
 * Variáveis gerenciadas aqui:
 *   WA_DEBUG = true   → logs verbosos do WhatsApp (Railway)
 */

const fs   = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, ".env.local");

// Variáveis que devem existir por padrão (chave → valor padrão)
const DEFAULTS = {
  WA_DEBUG: "true",
};

// Lê o conteúdo atual (ou string vazia se o arquivo não existir)
let current = "";
if (fs.existsSync(ENV_FILE)) {
  current = fs.readFileSync(ENV_FILE, "utf-8");
}

// Detecta quais chaves já estão no arquivo
const lines  = current.split("\n");
const keys   = new Set(
  lines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => l.split("=")[0].trim())
);

// Monta as linhas que precisam ser adicionadas
const missing = Object.entries(DEFAULTS)
  .filter(([key]) => !keys.has(key))
  .map(([key, val]) => `${key}=${val}`);

if (missing.length === 0) {
  console.log("[setup-env] ✅ Variáveis de ambiente já configuradas");
  process.exit(0);
}

// Adiciona ao final do arquivo com cabeçalho
const addition = [
  "",
  "# ── Adicionado automaticamente pelo setup-env.js ──────────────────────────",
  ...missing,
].join("\n");

fs.appendFileSync(ENV_FILE, addition, "utf-8");

console.log("[setup-env] ✅ Variáveis adicionadas ao .env.local:", missing.join(", "));
