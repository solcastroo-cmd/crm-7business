-- Migration: unique constraint em leads(phone, store_id)
-- Previne duplicate leads causados por race condition em webhooks concorrentes

-- Remove duplicatas existentes (mantém o lead mais antigo por phone+store_id)
DELETE FROM public.leads
WHERE id NOT IN (
  SELECT DISTINCT ON (phone, store_id) id
  FROM public.leads
  ORDER BY phone, store_id, created_at ASC
);

-- Índice único parcial para store_id preenchido
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_store_unique
  ON public.leads (phone, store_id)
  WHERE store_id IS NOT NULL;

-- Índice único para leads sem store_id (criados manualmente)
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_no_store_unique
  ON public.leads (phone)
  WHERE store_id IS NULL;
