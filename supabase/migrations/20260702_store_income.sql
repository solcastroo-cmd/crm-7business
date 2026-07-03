-- ═══════════════════════════════════════════════════════════════════════════
-- FLUXO DE CAIXA — recebimentos avulsos da loja (não vinculados a uma venda)
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.store_income (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid REFERENCES public.users(id) ON DELETE CASCADE,
  date           date NOT NULL DEFAULT CURRENT_DATE,
  description    text NOT NULL,
  category       text NOT NULL DEFAULT 'Outros',
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL DEFAULT 'pix',
  status         text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'pendente')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_income_store_idx ON public.store_income(store_id);
CREATE INDEX IF NOT EXISTS store_income_date_idx  ON public.store_income(date DESC);

ALTER TABLE public.store_income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso público temporário" ON public.store_income;
CREATE POLICY "Acesso público temporário"
  ON public.store_income FOR ALL
  USING (true) WITH CHECK (true);
