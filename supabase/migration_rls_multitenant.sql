-- ═══════════════════════════════════════════════════════════════════
-- RLS MULTI-TENANT — CRM 7Business
-- Garante que cada loja vê APENAS seus próprios dados.
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── LEADS ────────────────────────────────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_owner" ON public.leads;
CREATE POLICY "leads_owner" ON public.leads
  FOR ALL USING (store_id = auth.uid());

-- ── VEHICLES ─────────────────────────────────────────────────────────
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_owner" ON public.vehicles;
CREATE POLICY "vehicles_owner" ON public.vehicles
  FOR ALL USING (store_id = auth.uid());

-- ── MESSAGES ─────────────────────────────────────────────────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_owner" ON public.messages;
CREATE POLICY "messages_owner" ON public.messages
  FOR ALL USING (
    lead_id IN (
      SELECT id FROM public.leads WHERE store_id = auth.uid()
    )
  );

-- ── SALES ────────────────────────────────────────────────────────────
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_owner" ON public.sales;
CREATE POLICY "sales_owner" ON public.sales
  FOR ALL USING (store_id = auth.uid());

-- ── USERS (cada loja vê só seu próprio registro) ──────────────────────
DROP POLICY IF EXISTS "Acesso público temporário" ON public.users;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_owner" ON public.users;
CREATE POLICY "users_owner" ON public.users
  FOR ALL USING (id = auth.uid());

-- ── SERVICE ROLE bypassa RLS (usado pelo agente Paulo e webhooks) ─────
-- Nenhuma ação necessária: service_role já bypassa por padrão no Supabase.
