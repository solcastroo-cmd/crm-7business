-- ═══════════════════════════════════════════════════════════════════════════
-- IMPLANTAÇÃO — controle de baixa (pagamento) por parcela do cartão
-- Guarda os números das parcelas já pagas, ex: [1,2] = parcelas 1 e 2 quitadas
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.despesas_implantacao
  ADD COLUMN IF NOT EXISTS parcelas_pagas jsonb NOT NULL DEFAULT '[]'::jsonb;
