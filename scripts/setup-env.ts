/**
 * ⚙️ setup-env.ts
 * Helena roda: npm run setup:env
 * Cria o .env.local com as instruções de onde pegar cada chave.
 */

import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const ENV_PATH = join(process.cwd(), ".env.local");

const template = `# ============================================================
# CRM 7Business — Variáveis de Ambiente
# Gerado por: npm run setup:env
# ============================================================

# ── SUPABASE ─────────────────────────────────────────────────
# Onde pegar: https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# ── RAILWAY ──────────────────────────────────────────────────
# Onde pegar: https://railway.app/account/tokens
RAILWAY_TOKEN=

# ── WHATSAPP META API ────────────────────────────────────────
# Onde pegar: https://developers.facebook.com/apps
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=458776013989238
WA_VERIFY_TOKEN=7business_wa_token

# ── INSTAGRAM META API ───────────────────────────────────────
IG_PAGE_TOKEN=
IG_VERIFY_TOKEN=7business_ig_token

# ── EVOLUTION API (WhatsApp via QR) ─────────────────────────
EVOLUTION_API_URL=
EVOLUTION_API_KEY=ph7business_evo_key
EVOLUTION_INSTANCE=PH_AUTOSCAR
`;

function run() {
  console.log("\n⚙️  CRM 7Business — Gerador de .env.local\n");

  if (existsSync(ENV_PATH)) {
    console.log("⚠️  .env.local já existe — não sobrescrito.\n");
    console.log("   Delete o arquivo e rode novamente se quiser recriar.\n");
    process.exit(0);
  }

  writeFileSync(ENV_PATH, template, "utf-8");

  console.log("✅ .env.local criado!\n");
  console.log("📋 Próximos passos:");
  console.log("   1. Abra o arquivo  .env.local");
  console.log("   2. Preencha os valores vazios conforme as instruções");
  console.log("   3. Rode:  npm run check         ← valida tudo");
  console.log("   4. Rode:  npm run setup:db      ← cria tabelas");
  console.log("   5. Rode:  npm run setup:railway ← envia vars pro Railway\n");
}

run();
