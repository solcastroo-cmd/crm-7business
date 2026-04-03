-- Tabela principal de leads do CRM 7Business
-- Execute no Supabase > SQL Editor

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  name        text,
  stage       text not null default 'Novo Lead',
  source      text not null default 'manual',
  budget      text,
  type        text,
  payment     text,
  seller      text,
  veiculo_interesse_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Atualiza updated_at automaticamente
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on public.leads
  for each row execute function update_updated_at();

-- Índices para performance
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists leads_phone_idx on public.leads(phone);
create index if not exists leads_created_at_idx on public.leads(created_at desc);

-- Row Level Security (básico por enquanto)
alter table public.leads enable row level security;

create policy "Acesso público temporário"
  on public.leads for all
  using (true)
  with check (true);
