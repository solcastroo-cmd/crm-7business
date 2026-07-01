-- ═══════════════════════════════════════════════════════════════════════════
-- Cancelamento de vendas — nova seção "Cancelamentos" no módulo Vendas
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check
  CHECK (status = ANY (ARRAY['pago'::text,'pendente'::text,'parcelado'::text,'cancelada'::text]));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_notes text;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_cancellation_reason_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_cancellation_reason_check
  CHECK (cancellation_reason IS NULL OR cancellation_reason IN (
    'financiamento_reprovado','desistencia_cliente','problema_veiculo','erro_negociacao','outro'
  ));

CREATE INDEX IF NOT EXISTS sales_status_idx ON public.sales(status);
