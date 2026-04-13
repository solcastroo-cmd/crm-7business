-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: external_id em messages — deduplicação de webhooks
-- Evita que a Evolution API reenvie o mesmo evento e gere respostas duplicadas
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_id text;

-- Índice único parcial: só para mensagens com external_id preenchido
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_idx
  ON public.messages (external_id)
  WHERE external_id IS NOT NULL;

-- Também adiciona ai_enabled na leads (caso ainda não tenha rodado a outra migration)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
