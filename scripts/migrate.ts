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

-- ── PRIORIDADE ALTA: coluna position para ordenação do Kanban ─────────────────
-- Usamos FLOAT para inserção fracionária entre leads (midpoint), evitando
-- reindexar toda a coluna a cada drag-and-drop.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='position'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN position FLOAT NOT NULL DEFAULT 0;

    -- Inicializa posições existentes em ordem de criação, por stage
    -- (garante posições únicas e crescentes dentro de cada coluna)
    UPDATE public.leads l
    SET position = sub.rn * 1000
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY stage ORDER BY created_at ASC) AS rn
      FROM public.leads
    ) sub
    WHERE l.id = sub.id;
  END IF;
END $$;

-- ── FEAT-02: coluna notes para anotações livres do vendedor ──────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='notes'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN notes TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_stage_idx      ON public.leads(stage);
CREATE INDEX IF NOT EXISTS leads_phone_idx      ON public.leads(phone);
CREATE INDEX IF NOT EXISTS leads_store_id_idx   ON public.leads(store_id);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at DESC);
-- Índice composto para busca rápida de leads ordenados por coluna
CREATE INDEX IF NOT EXISTS leads_stage_position_idx ON public.leads(stage, position ASC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='leads' AND policyname='leads_acesso_publico'
  ) THEN
    CREATE POLICY leads_acesso_publico ON public.leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── FEAT-07: coluna qualification nos leads ────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='qualification'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN qualification text CHECK (qualification IN ('quente','morno','frio'));
  END IF;
END $$;

-- ── FEAT-09: tabela messages (histórico WhatsApp) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  text       text NOT NULL,
  from_me    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='messages_acesso_publico'
  ) THEN
    CREATE POLICY messages_acesso_publico ON public.messages FOR ALL USING (true) WITH CHECK (true);
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
  notify_phone     text,
  sellers          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Colunas adicionadas em versões anteriores (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='notify_phone'
  ) THEN
    ALTER TABLE public.users ADD COLUMN notify_phone text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='sellers'
  ) THEN
    ALTER TABLE public.users ADD COLUMN sellers jsonb;
  END IF;
END $$;

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

-- ── Trigger updated_at ────────────────────────────────────────────────────────
-- Atualiza updated_at automaticamente em qualquer UPDATE nas tabelas.
-- Sem isso, a coluna existe mas nunca muda — dado inconsistente.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'leads_set_updated_at'
  ) THEN
    CREATE TRIGGER leads_set_updated_at
      BEFORE UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'users_set_updated_at'
  ) THEN
    CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
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
    console.log("✅ Tabelas criadas/verificadas: leads, users, messages");

    // Verifica tabelas
    const res = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('leads','users','messages')
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
