-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ai_enabled — controle de handoff IA ↔ Humano
-- Quando um vendedor envia mensagem manualmente, ai_enabled = false
-- e o Paulo para de responder automaticamente para esse lead.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leads.ai_enabled IS
  'true = Paulo (IA) responde automaticamente | false = vendedor humano assumiu o atendimento';
