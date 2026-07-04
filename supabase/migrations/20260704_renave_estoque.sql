-- ═══════════════════════════════════════════════════════════════════════════
-- Módulo RENAVE/Estoque — status de gravame/RENAVE integrado ao cadastro
-- do veículo, com histórico de mudanças. Escrita 100% manual por enquanto;
-- schema preparado para futura integração via API (SERPRO/DETRAN-CE/Senatran).
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS renave_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS renave_gravame_number text;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_renave_status_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_renave_status_check
  CHECK (renave_status = ANY (ARRAY['pendente'::text,'enviado'::text,'aprovado'::text,'rejeitado'::text]));

CREATE INDEX IF NOT EXISTS vehicles_renave_status_idx ON public.vehicles(renave_status);

CREATE TABLE IF NOT EXISTS public.renave_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  status          text NOT NULL,
  previous_status text,
  notes           text,
  changed_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS renave_status_history_vehicle_idx ON public.renave_status_history(vehicle_id);

ALTER TABLE public.renave_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso público temporário" ON public.renave_status_history;
CREATE POLICY "Acesso público temporário"
  ON public.renave_status_history FOR ALL
  USING (true) WITH CHECK (true);
