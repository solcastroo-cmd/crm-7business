-- Migration: Trial e plano comercial
-- Execute no Supabase > SQL Editor

alter table public.users
  add column if not exists trial_ends_at  timestamptz,
  add column if not exists plan_status    text not null default 'trial';

-- Usuários já existentes ficam como ativos (grandfathered)
update public.users
  set plan_status = 'active'
  where plan_status = 'trial' and trial_ends_at is null;

comment on column public.users.trial_ends_at is 'Data de expiração do trial. NULL = usuário ativo (sem trial).';
comment on column public.users.plan_status   is 'trial | active | expired | cancelled';
