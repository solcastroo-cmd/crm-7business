/**
 * 🔑 fetch-supabase-keys.ts — Alex + Bruno
 * Busca as chaves do Supabase automaticamente via Management API.
 * Helena roda: npm run fetch:keys
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const PROJECT_REF   = "fgfqbbwpldnjdgpishpn";
const ENV_PATH      = join(process.cwd(), ".env.local");

// Lê o SUPABASE_PAT do .env.local se já existir
function readEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const vars: Record<string, string> = {};
  readFileSync(ENV_PATH, "utf-8").split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const idx = clean.indexOf("=");
    if (idx === -1) return;
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) vars[key] = val;
  });
  return vars;
}

function updateEnvLocal(updates: Record<string, string>) {
  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  writeFileSync(ENV_PATH, content, "utf-8");
}

async function run() {
  console.log("\n🔑 CRM 7Business — Buscando chaves Supabase automaticamente\n");

  const env = readEnvLocal();
  const PAT = env.SUPABASE_PAT || process.env.SUPABASE_PAT;

  if (!PAT) {
    console.error("❌ SUPABASE_PAT não encontrado no .env.local\n");
    console.log("📋 Como gerar (30 segundos):");
    console.log("   1. Acesse: https://supabase.com/dashboard/account/tokens");
    console.log('   2. Clique em "Generate new token"');
    console.log('   3. Nome: "CRM 7Business"');
    console.log("   4. Copie o token gerado");
    console.log("   5. Adicione no .env.local:");
    console.log("      SUPABASE_PAT=seu_token_aqui\n");
    console.log("   6. Rode novamente:  npm run fetch:keys\n");
    process.exit(1);
  }

  console.log(`📡 Conectando à Supabase Management API...`);
  console.log(`   Projeto: ${PROJECT_REF}\n`);

  // Buscar API keys do projeto
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    {
      headers: {
        "Authorization": `Bearer ${PAT}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ Erro na API (${res.status}):`, err);
    if (res.status === 401) {
      console.error("\n💡 Token inválido ou expirado. Gere um novo em:");
      console.error("   https://supabase.com/dashboard/account/tokens\n");
    }
    process.exit(1);
  }

  const keys = await res.json() as Array<{ name: string; api_key: string }>;

  const anon        = keys.find((k) => k.name === "anon")?.api_key;
  const serviceRole = keys.find((k) => k.name === "service_role")?.api_key;

  if (!anon || !serviceRole) {
    console.error("❌ Chaves não encontradas na resposta:", JSON.stringify(keys));
    process.exit(1);
  }

  // Salvar no .env.local automaticamente
  updateEnvLocal({
    NEXT_PUBLIC_SUPABASE_URL:     `https://${PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_KEY:          serviceRole,
  });

  console.log("✅ Chaves salvas no .env.local:");
  console.log(`   NEXT_PUBLIC_SUPABASE_URL     = https://${PROJECT_REF}.supabase.co`);
  console.log(`   NEXT_PUBLIC_SUPABASE_ANON_KEY = ${anon.slice(0, 20)}...`);
  console.log(`   SUPABASE_SERVICE_KEY          = ${serviceRole.slice(0, 20)}...`);
  console.log("\n🚀 Próximo passo: npm run check\n");
}

run().catch((e) => {
  console.error("❌ Erro inesperado:", e.message);
  process.exit(1);
});
