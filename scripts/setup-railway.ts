/**
 * 🚂 setup-railway.ts
 * Helena roda: npm run setup:railway
 * Envia todas as variáveis de ambiente para o Railway automaticamente.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const RAILWAY_TOKEN   = process.env.RAILWAY_TOKEN;
const RAILWAY_PROJECT = "5095dcb4-81a6-4fa9-8684-2fc82e8e0fb9";

// Variáveis que serão enviadas ao Railway (lidas do .env.local)
const VAR_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WA_VERIFY_TOKEN",
  "IG_PAGE_TOKEN",
  "IG_VERIFY_TOKEN",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
];

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const vars: Record<string, string> = {};
  readFileSync(path, "utf-8").split("\n").forEach((line) => {
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

async function railwayGraphQL(query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
  return json.data;
}

async function run() {
  console.log("\n🚂 CRM 7Business — Setup Railway\n");

  if (!RAILWAY_TOKEN) {
    console.error("❌ RAILWAY_TOKEN ausente no .env.local");
    console.error("   Gere em: https://railway.app/account/tokens\n");
    process.exit(1);
  }

  // Ler variáveis do .env.local
  const envLocal = parseEnvFile(join(process.cwd(), ".env.local"));
  const envFallback = parseEnvFile(join(process.cwd(), ".env"));
  const allVars = { ...envFallback, ...envLocal };

  // Filtrar apenas as vars que existem e têm valor
  const toSend = VAR_KEYS
    .map((k) => ({ key: k, value: allVars[k] ?? "" }))
    .filter((v) => v.value && !v.value.includes("SEU_") && !v.value.includes("_AQUI"));

  if (toSend.length === 0) {
    console.error("❌ Nenhuma variável configurada no .env.local\n");
    process.exit(1);
  }

  console.log(`📡 Enviando ${toSend.length} variáveis para o Railway...`);
  console.log(`   Projeto: ${RAILWAY_PROJECT}\n`);

  // Buscar serviceId do projeto
  const projectData = await railwayGraphQL(
    `query { project(id: $id) { services { edges { node { id name } } } } }`,
    { id: RAILWAY_PROJECT }
  ) as { project: { services: { edges: Array<{ node: { id: string; name: string } }> } } };

  const services = projectData.project.services.edges;
  if (services.length === 0) {
    console.error("❌ Nenhum serviço encontrado no projeto Railway");
    process.exit(1);
  }

  const service = services[0].node;
  console.log(`   Serviço: ${service.name} (${service.id})\n`);

  // Enviar variáveis
  for (const { key, value } of toSend) {
    await railwayGraphQL(
      `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      { input: { projectId: RAILWAY_PROJECT, serviceId: service.id, environmentId: "production", name: key, value } }
    );
    console.log(`   ✅ ${key}`);
  }

  console.log("\n🎉 Variáveis enviadas! Railway vai fazer redeploy automaticamente.\n");
}

run().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});
