-- Tabela de usuários/lojas do CRM 7Business
-- Execute no Supabase > SQL Editor

create table if not exists public.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  business_id         text,                    -- Meta Business ID
  phone_number_id     text,                    -- WhatsApp Phone Number ID
  whatsapp_token      text,                    -- Access token (long-lived)
  token_expires_at    timestamptz,             -- Data de expiração (~60 dias)
  oauth_state         text,                    -- CSRF state temporário
  state_expires_at    timestamptz,             -- TTL do state (10 min) — BUG-02
  display_phone       text,                    -- Ex: +55 85 99999-8888
  business_name       text,                    -- Nome da loja
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Adiciona coluna state_expires_at se já existir a tabela (migração segura)
alter table public.users
  add column if not exists state_expires_at timestamptz;

-- Atualiza updated_at automaticamente
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

-- Índices
create index if not exists users_business_id_idx   on public.users(business_id);
create index if not exists users_oauth_state_idx   on public.users(oauth_state);
create index if not exists users_state_expires_idx on public.users(state_expires_at);

-- RLS
alter table public.users enable row level security;

drop policy if exists "Acesso público temporário" on public.users;
create policy "Acesso público temporário"
  on public.users for all
  using (true)
  with check (true);
