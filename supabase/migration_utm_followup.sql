-- ============================================================
-- Migration: UTMs, fbclid, follow-up, dedup persistente
-- Execute no Supabase > SQL Editor
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS utm_medium      text,
  ADD COLUMN IF NOT EXISTS utm_adset       text,
  ADD COLUMN IF NOT EXISTS utm_ad          text,
  ADD COLUMN IF NOT EXISTS fbclid          text,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count  integer DEFAULT 0;

-- Garante que capi_events existe como array (criado na migration anterior)
ALTER TABLE public.leads
  ALTER COLUMN capi_events SET DEFAULT '{}';

CREATE INDEX IF NOT EXISTS leads_followup_idx ON public.leads(last_followup_at, stage);
CREATE INDEX IF NOT EXISTS leads_fbclid_idx   ON public.leads(fbclid) WHERE fbclid IS NOT NULL;
