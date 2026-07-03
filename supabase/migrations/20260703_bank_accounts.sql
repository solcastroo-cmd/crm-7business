-- ═══════════════════════════════════════════════════════════════════════════
-- FLUXO DE CAIXA — saldo de referência das contas bancárias da loja
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid REFERENCES public.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  balance        numeric(12,2) NOT NULL DEFAULT 0,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_accounts_store_idx ON public.bank_accounts(store_id);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso público temporário" ON public.bank_accounts;
CREATE POLICY "Acesso público temporário"
  ON public.bank_accounts FOR ALL
  USING (true) WITH CHECK (true);
