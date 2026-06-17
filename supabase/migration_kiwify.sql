-- Migration: suporte a compras via Kiwify
-- Execute no Supabase > SQL Editor

alter table public.users
  add column if not exists kiwify_order  text,
  add column if not exists plan          text not null default 'trial',
  add column if not exists plan_status   text not null default 'active',
  add column if not exists notify_phone  text;

create index if not exists users_kiwify_order_idx on public.users(kiwify_order);
create index if not exists users_plan_idx         on public.users(plan);
