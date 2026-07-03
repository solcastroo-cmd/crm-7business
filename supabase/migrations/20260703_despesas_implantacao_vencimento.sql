-- ═══════════════════════════════════════════════════════════════════════════
-- IMPLANTAÇÃO — data de vencimento da 1ª parcela do cartão de crédito
-- As demais parcelas são calculadas mês a mês a partir dessa data
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.despesas_implantacao
  ADD COLUMN IF NOT EXISTS data_vencimento date;
