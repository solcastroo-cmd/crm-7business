-- migration_messages_media.sql
-- Adiciona suporte a mensagens de mídia (imagens de veículos enviadas pelo Paulo)

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type      text NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'image')),
  ADD COLUMN IF NOT EXISTS media_url text;

COMMENT ON COLUMN public.messages.type      IS 'Tipo da mensagem: text ou image';
COMMENT ON COLUMN public.messages.media_url IS 'URL da imagem quando type = image';
