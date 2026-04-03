/**
 * 🗄️ setup-db.ts
 * Helena roda: npm run setup:db
 * Cria todas as tabelas no Supabase automaticamente.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Carrega .env.local manualmente
function loadEnv() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  readFileSync(path, "utf-8").split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const idx = clean.indexOf("=");
    if (idx === -1) return;
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  });
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PAT = process.env.SUPABASE_PAT; // Personal Access Token para Management API

async function run() {
  console.log("\n🗄️  CRM 7Business — Setup do Banco de Dados\n");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ Variáveis ausentes no .env.local:");
    if (!SUPABASE_URL)         console.error("   → NEXT_PUBLIC_SUPABASE_URL");
    if (!SUPABASE_SERVICE_KEY) console.error("   → SUPABASE_SERVICE_KEY");
    console.error("\n💡 Copie do painel Supabase → Project Settings → API\n");
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "supabase", "leads.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  console.log("📡 Conectando ao Supabase...");
  console.log(`   URL: ${SUPABASE_URL}\n`);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  // Supabase não tem /rpc/exec_sql por padrão — usamos a Management API
  if (res.status === 404) {
    await runViaMigration(sql);
    return;
  }

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Erro ao executar SQL:", err);
    process.exit(1);
  }

  console.log("✅ Tabela leads criada com sucesso!\n");
}

async function runViaMigration(sql: string) {
  const projectRef = SUPABASE_URL!.replace("https://", "").split(".")[0];
  const authToken  = SUPABASE_PAT || SUPABASE_SERVICE_KEY;

  console.log(`🔧 Usando Management API (projeto: ${projectRef})...`);

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    // Tabela já existe = ok
    if (err.includes("already exists")) {
      console.log("✅ Tabela já existe — nada a fazer.\n");
      return;
    }
    console.error("❌ Erro:", err);
    console.log("\n📋 Fallback manual — copie e cole no Supabase SQL Editor:");
    console.log("   https://supabase.com/dashboard/project/_/sql\n");
    console.log("─".repeat(60));
    console.log(sql);
    console.log("─".repeat(60));
    process.exit(1);
  }

  console.log("✅ Banco configurado com sucesso!\n");
  const data = await res.json();
  console.log("   Resultado:", JSON.stringify(data).slice(0, 100));
}

run().catch((e) => {
  console.error("❌ Erro inesperado:", e.message);
  process.exit(1);
});
