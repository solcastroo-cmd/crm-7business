-- ============================================================
-- Migration: CAPI Score + Logs
-- Execute no Supabase > SQL Editor
-- ============================================================

-- 1. Adiciona colunas de score e CAPI na tabela leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score          integer   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capi_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS capi_events    text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS utm_source     text,
  ADD COLUMN IF NOT EXISTS utm_campaign   text,
  ADD COLUMN IF NOT EXISTS vehicle_name   text,
  ADD COLUMN IF NOT EXISTS sale_value     numeric;

-- Índice para busca por score
CREATE INDEX IF NOT EXISTS leads_score_idx ON public.leads(score DESC);
CREATE INDEX IF NOT EXISTS leads_store_stage_idx ON public.leads(store_id, stage);

-- 2. Tabela de logs da CAPI (auditoria completa)
CREATE TABLE IF NOT EXISTS public.capi_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid,
  lead_id     uuid        REFERENCES public.leads(id) ON DELETE SET NULL,
  event_name  text        NOT NULL,
  status      text        NOT NULL CHECK (status IN ('success', 'error')),
  events_received integer,
  error_msg   text,
  phone_hash  text,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capi_logs_lead_idx    ON public.capi_logs(lead_id);
CREATE INDEX IF NOT EXISTS capi_logs_store_idx   ON public.capi_logs(store_id);
CREATE INDEX IF NOT EXISTS capi_logs_created_idx ON public.capi_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS capi_logs_status_idx  ON public.capi_logs(status);

ALTER TABLE public.capi_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso público capi_logs" ON public.capi_logs FOR ALL USING (true) WITH CHECK (true);
