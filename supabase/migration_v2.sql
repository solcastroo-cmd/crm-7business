-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO V2 — CRM 7Business Veículos
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA USERS — novos campos SaaS + integrações UltraMsg + Instagram
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cnpj              text,
  ADD COLUMN IF NOT EXISTS store_phone       text,
  ADD COLUMN IF NOT EXISTS address           text,
  ADD COLUMN IF NOT EXISTS sellers           text[],
  ADD COLUMN IF NOT EXISTS notify_phone      text,
  ADD COLUMN IF NOT EXISTS plan              text DEFAULT 'starter',
  -- IA
  ADD COLUMN IF NOT EXISTS ai_enabled        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_name           text DEFAULT 'Paulo',
  ADD COLUMN IF NOT EXISTS ai_personality    text,
  -- UltraMsg
  ADD COLUMN IF NOT EXISTS ultramsg_instance text,
  ADD COLUMN IF NOT EXISTS ultramsg_token    text,
  ADD COLUMN IF NOT EXISTS ultramsg_phone    text,
  -- Instagram
  ADD COLUMN IF NOT EXISTS instagram_token      text,
  ADD COLUMN IF NOT EXISTS instagram_account_id text,
  ADD COLUMN IF NOT EXISTS instagram_username   text;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABELA VEHICLES — campos completos para veículos
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid REFERENCES public.users(id) ON DELETE CASCADE,
  brand         text NOT NULL,
  model         text NOT NULL,
  year          text,
  plate         text,
  price         numeric(12,2),
  price_fipe    numeric(12,2),
  color         text,
  km            integer,
  fuel          text,
  transmission  text,
  body_type     text,
  doors         integer,
  end_plate     text,
  renavam       text,
  chassis       text,
  ipva_paid     boolean DEFAULT false,
  single_owner  boolean DEFAULT false,
  has_manual    boolean DEFAULT false,
  has_key       boolean DEFAULT false,
  optional_items text[],
  description   text,
  status        text NOT NULL DEFAULT 'disponivel'
                  CHECK (status IN ('disponivel','vendido','reservado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Colunas extras caso a tabela já exista
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS store_id      uuid,
  ADD COLUMN IF NOT EXISTS price_fipe    numeric(12,2),
  ADD COLUMN IF NOT EXISTS body_type     text,
  ADD COLUMN IF NOT EXISTS doors         integer,
  ADD COLUMN IF NOT EXISTS end_plate     text,
  ADD COLUMN IF NOT EXISTS renavam       text,
  ADD COLUMN IF NOT EXISTS chassis       text,
  ADD COLUMN IF NOT EXISTS ipva_paid     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS single_owner  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_manual    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_key       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS optional_items text[];

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vehicles_updated_at ON public.vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS vehicles_store_idx  ON public.vehicles(store_id);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON public.vehicles(status);
CREATE INDEX IF NOT EXISTS vehicles_brand_idx  ON public.vehicles(brand);

-- RLS permissivo (ajuste por store_id conforme sua política)
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso público temporário" ON public.vehicles;
CREATE POLICY "Acesso público temporário"
  ON public.vehicles FOR ALL
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. TABELA LEADS — campo store_id para multi-tenant
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS store_id       uuid,
  ADD COLUMN IF NOT EXISTS position       float8 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualification  text CHECK (qualification IN ('quente','morno','frio')),
  ADD COLUMN IF NOT EXISTS tags           text[],
  ADD COLUMN IF NOT EXISTS seller         text,
  ADD COLUMN IF NOT EXISTS notes          text;

CREATE INDEX IF NOT EXISTS leads_store_idx ON public.leads(store_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TABELA MESSAGES — histórico de mensagens
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  direction  text NOT NULL CHECK (direction IN ('in','out')),
  content    text,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_lead_idx ON public.messages(lead_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages(created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso público temporário" ON public.messages;
CREATE POLICY "Acesso público temporário"
  ON public.messages FOR ALL
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- FIM DA MIGRAÇÃO
-- ────────────────────────────────────────────────────────────────────────────
