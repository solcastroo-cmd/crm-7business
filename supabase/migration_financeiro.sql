-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO FINANCEIRO — CRM 7Business
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Novos campos financeiros na tabela vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS purchase_price    numeric(12,2),
  ADD COLUMN IF NOT EXISTS actual_sale_price numeric(12,2);

-- 2. Tabela de despesas por veículo
CREATE TABLE IF NOT EXISTS public.vehicle_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  store_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date       date NOT NULL DEFAULT CURRENT_DATE,
  category   text NOT NULL CHECK (category IN (
    'Oficina','Pneus','Combustível','Documentação',
    'Multas','Taxas','IPVA/Seguro','Outros'
  )),
  description text,
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_expenses_vehicle_idx ON public.vehicle_expenses(vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_expenses_store_idx   ON public.vehicle_expenses(store_id);
CREATE INDEX IF NOT EXISTS vehicle_expenses_date_idx    ON public.vehicle_expenses(date DESC);

ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso público temporário" ON public.vehicle_expenses;
CREATE POLICY "Acesso público temporário"
  ON public.vehicle_expenses FOR ALL
  USING (true) WITH CHECK (true);
