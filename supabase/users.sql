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
  display_phone       text,                    -- Ex: +55 85 99999-8888
  business_name       text,                    -- Nome da loja
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Atualiza updated_at automaticamente
create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

-- Índices
create index if not exists users_business_id_idx  on public.users(business_id);
create index if not exists users_oauth_state_idx  on public.users(oauth_state);

-- RLS
alter table public.users enable row level security;

create policy "Acesso público temporário"
  on public.users for all
  using (true)
  with check (true);
