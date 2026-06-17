-- ============================================================
-- MIGRAÇÃO: Módulo de Consignação de Veículos
-- CRM 7Business — Rodar no Supabase SQL Editor
-- ============================================================

-- 1. Tabela principal de contratos
CREATE TABLE IF NOT EXISTS consignment_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Consignante (proprietário)
  proprietario_nome          TEXT,
  proprietario_nacionalidade TEXT DEFAULT 'Brasileiro(a)',
  proprietario_estado_civil  TEXT,
  proprietario_profissao     TEXT,
  proprietario_rg            TEXT,
  proprietario_cpf_cnpj      TEXT,
  proprietario_endereco      TEXT,
  proprietario_telefone      TEXT,
  proprietario_email         TEXT,

  -- Consignatária (loja)
  loja_razao_social   TEXT DEFAULT 'PHD Motors',
  loja_nome_fantasia  TEXT DEFAULT 'PHD Motors',
  loja_cnpj           TEXT,
  loja_responsavel    TEXT,

  -- Veículo
  veiculo_marca          TEXT,
  veiculo_modelo         TEXT,
  veiculo_versao         TEXT,
  veiculo_ano_fabricacao INT,
  veiculo_ano_modelo     INT,
  veiculo_placa          TEXT,
  veiculo_chassi         TEXT,
  veiculo_renavam        TEXT,
  veiculo_cor            TEXT,
  veiculo_combustivel    TEXT,
  veiculo_km_atual       INT,

  -- Valor e comissão
  valor_minimo_venda   NUMERIC(12,2),
  percentual_comissao  NUMERIC(5,2) DEFAULT 5.0,

  -- Prazo
  data_inicio   DATE,
  data_final    DATE,
  taxa_retirada NUMERIC(10,2),

  -- Vistoria
  vistoria_pintura     TEXT,
  vistoria_pneus       TEXT,
  vistoria_interior    TEXT,
  observacoes_vistoria TEXT,

  -- Foro e assinatura
  cidade_foro    TEXT DEFAULT 'Fortaleza',
  data_assinatura DATE,

  -- Status: ativo | vendido | retirado | vencido
  status TEXT DEFAULT 'ativo',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de fotos de vistoria
CREATE TABLE IF NOT EXISTS consignment_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES consignment_contracts(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  label       TEXT DEFAULT 'Foto',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_consignment_contracts_user_id    ON consignment_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_consignment_contracts_status     ON consignment_contracts(status);
CREATE INDEX IF NOT EXISTS idx_consignment_photos_contract_id   ON consignment_photos(contract_id);

-- 4. RLS
ALTER TABLE consignment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_photos    ENABLE ROW LEVEL SECURITY;

-- Policies: consignment_contracts
DROP POLICY IF EXISTS "consignment_contracts_select" ON consignment_contracts;
DROP POLICY IF EXISTS "consignment_contracts_insert" ON consignment_contracts;
DROP POLICY IF EXISTS "consignment_contracts_update" ON consignment_contracts;
DROP POLICY IF EXISTS "consignment_contracts_delete" ON consignment_contracts;

CREATE POLICY "consignment_contracts_select" ON consignment_contracts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "consignment_contracts_insert" ON consignment_contracts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "consignment_contracts_update" ON consignment_contracts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "consignment_contracts_delete" ON consignment_contracts
  FOR DELETE USING (auth.uid() = user_id);

-- Policies: consignment_photos
DROP POLICY IF EXISTS "consignment_photos_select" ON consignment_photos;
DROP POLICY IF EXISTS "consignment_photos_insert" ON consignment_photos;
DROP POLICY IF EXISTS "consignment_photos_delete" ON consignment_photos;

CREATE POLICY "consignment_photos_select" ON consignment_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM consignment_contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "consignment_photos_insert" ON consignment_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM consignment_contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "consignment_photos_delete" ON consignment_photos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM consignment_contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );

-- 5. Storage bucket (rodar separado no Dashboard > Storage se necessário)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('consignment-photos', 'consignment-photos', true)
-- ON CONFLICT DO NOTHING;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
