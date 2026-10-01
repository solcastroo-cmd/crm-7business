-- ═══════════════════════════════════════════════════════════════════════════
-- RENAVE — fecha a política "Acesso público temporário" do histórico.
-- Acesso restrito ao dono do veículo (mesma regra de vehicles_owner).
-- O backend usa service role e não é afetado.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Acesso público temporário" ON public.renave_status_history;
DROP POLICY IF EXISTS renave_status_history_owner ON public.renave_status_history;
CREATE POLICY renave_status_history_owner
  ON public.renave_status_history FOR ALL
  USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.store_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.store_id = auth.uid()));
