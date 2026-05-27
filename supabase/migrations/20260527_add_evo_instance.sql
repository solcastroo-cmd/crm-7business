-- Migração: substituir Z-API por Evolution API
-- Adiciona coluna evo_instance na tabela users (stores)

ALTER TABLE users ADD COLUMN IF NOT EXISTS evo_instance TEXT;

-- Índice para lookup rápido no webhook
CREATE INDEX IF NOT EXISTS idx_users_evo_instance ON users(evo_instance);

-- Configura a conta da Soraya com o nome da instância Evolution
-- (ajuste o email se necessário)
UPDATE users
SET evo_instance = 'soraya_5585994033032'
WHERE email = 'sorayapauloitau@gmail.com';
