-- Migration: adiciona coluna qualification aos leads
-- Executar no Supabase SQL Editor

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS qualification TEXT
  CHECK (qualification IN ('quente', 'morno', 'frio'))
  DEFAULT 'frio';

-- Índice para filtrar rapidamente leads quentes
CREATE INDEX IF NOT EXISTS idx_leads_qualification ON leads(qualification);
