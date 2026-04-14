-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Portais de Veículos: OLX, Webmotors, iCarros, Facebook Leads
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Campo user_id na tabela leads (para multi-tenant SaaS)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS leads_user_id_idx ON public.leads(user_id);

-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  -- OLX
  ADD COLUMN IF NOT EXISTS olx_webhook_token   text,
  ADD COLUMN IF NOT EXISTS olx_active          boolean DEFAULT false,
  -- Webmotors
  ADD COLUMN IF NOT EXISTS webmotors_webhook_token text,
  ADD COLUMN IF NOT EXISTS webmotors_active        boolean DEFAULT false,
  -- iCarros
  ADD COLUMN IF NOT EXISTS icarros_webhook_token text,
  ADD COLUMN IF NOT EXISTS icarros_active        boolean DEFAULT false,
  -- Facebook Lead Ads
  ADD COLUMN IF NOT EXISTS fb_page_access_token  text,
  ADD COLUMN IF NOT EXISTS fb_page_id            text,
  ADD COLUMN IF NOT EXISTS fb_lead_verify_token  text,
  ADD COLUMN IF NOT EXISTS fb_leads_active       boolean DEFAULT false;
