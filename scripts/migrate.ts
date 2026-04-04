/**
 * migrate.ts — roda no deploy do Railway (npm run migrate)
 * Cria todas as tabelas necessárias via conexão direta PostgreSQL.
 *
 * Variável obrigatória: DATABASE_URL
 * Pegar em: Supabase → Project Settings → Database → URI (Transaction pooler)
 */

import { Client } from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

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

// ── Garante WA_DEBUG ativo por padrão ─────────────────────────────────────────
// Logs verbosos do WhatsApp ficam sempre ligados — sem precisar configurar manualmente.
if (!process.env.WA_DEBUG) process.env.WA_DEBUG = "true";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("\n❌ DATABASE_URL não configurada.");
  console.error("   Adicione no Railway → Variables → DATABASE_URL");
  console.error("   Pegar em: Supabase → Project Settings → Database → URI\n");
  process.exit(1);
}

const SQL = `
-- ── Tabela leads ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  name        text,
  stage       text NOT NULL DEFAULT 'Novo Lead',
  source      text NOT NULL DEFAULT 'manual',
  budget      text,
  type        text,
  payment     text,
  seller      text,
  store_id    uuid,
  veiculo_interesse_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Adiciona store_id em tabelas existentes (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='store_id'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN store_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_stage_idx      ON public.leads(stage);
CREATE INDEX IF NOT EXISTS leads_phone_idx      ON public.leads(phone);
CREATE INDEX IF NOT EXISTS leads_store_id_idx   ON public.leads(store_id);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='leads' AND policyname='leads_acesso_publico'
  ) THEN
    CREATE POLICY leads_acesso_publico ON public.leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Tabela users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text UNIQUE,
  business_id      text,
  phone_number_id  text,
  whatsapp_token   text,
  token_expires_at timestamptz,
  oauth_state      text,
  state_expires_at timestamptz,
  display_phone    text,
  business_name    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_business_id_idx ON public.users(business_id);
CREATE INDEX IF NOT EXISTS users_oauth_state_idx ON public.users(oauth_state);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_acesso_publico'
  ) THEN
    CREATE POLICY users_acesso_publico ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function migrate() {
  console.log("\n🗄️  CRM 7Business — Migration\n");

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log("✅ Conectado ao banco de dados");

    await client.query(SQL);
    console.log("✅ Tabelas criadas/verificadas: leads, users");

    // Verifica tabelas
    const res = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('leads','users')
      ORDER BY tablename;
    `);
    console.log("📋 Tabelas no banco:", res.rows.map((r: {tablename: string}) => r.tablename).join(", "));
    console.log("\n🚀 Migration concluída!\n");

  } catch (err) {
    console.error("❌ Erro na migration:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
