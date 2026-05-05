-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: coluna sender em messages
-- Distingue quem enviou cada mensagem: 'client' | 'ai' | 'human'
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender text
  CHECK (sender IN ('client', 'ai', 'human'));

-- Preenche retroativamente com base em from_me
-- (mensagens antigas não têm como distinguir IA de humano — marcamos como 'human' conservadoramente)
UPDATE public.messages
  SET sender = CASE WHEN from_me = false THEN 'client' ELSE 'human' END
  WHERE sender IS NULL;

CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages(sender);
