-- Migration: Unique constraint em messages.external_id
-- Garante que a mesma mensagem do WhatsApp nunca seja inserida duas vezes
-- Execute no Supabase > SQL Editor

-- Garante que a coluna existe
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_id text;

-- Remove duplicatas existentes antes de criar o índice
-- (mantém o registro mais antigo de cada external_id)
DELETE FROM public.messages
WHERE id NOT IN (
  SELECT DISTINCT ON (external_id) id
  FROM public.messages
  WHERE external_id IS NOT NULL
  ORDER BY external_id, created_at ASC
)
AND external_id IS NOT NULL;

-- Cria índice único parcial (só onde external_id não é NULL)
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_unique
  ON public.messages(external_id)
  WHERE external_id IS NOT NULL;

-- Índice de busca por lead_id + created_at (usado pelo isDbDuplicate)
CREATE INDEX IF NOT EXISTS messages_lead_created_idx
  ON public.messages(lead_id, created_at DESC);
