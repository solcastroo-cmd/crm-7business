-- ═══════════════════════════════════════════════════════════════════════════
-- CEP do comprador — permite auto-preencher parte do endereço via ViaCEP
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS buyer_cep text;
