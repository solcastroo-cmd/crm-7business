-- Inteligência de lead: perfil da IA, alerta único ao vendedor, mapa anúncio -> carro e views de funil.
-- Aplicada em produção em 2026-10-17 (migration "lead_intelligence").
alter table public.leads
  add column if not exists ai_profile jsonb,
  add column if not exists ai_summary text,
  add column if not exists ai_temperature text,
  add column if not exists ai_intent text,
  add column if not exists ai_score integer,
  add column if not exists ai_analyzed_at timestamptz,
  add column if not exists hot_alerted_at timestamptz;

-- Qual carro cada anúncio do Meta vende (ad_id = externalAdReply.sourceId da Z-API).
-- Sem linha aqui, o webhook tenta casar marca+modelo+ano no título/texto do anúncio.
create table if not exists public.meta_ads (
  ad_id         text primary key,
  ad_name       text,
  campaign_name text,
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  vehicle_label text,
  created_at    timestamptz not null default now()
);
alter table public.meta_ads enable row level security;

drop view if exists public.v_lead_ad_funnel;
create view public.v_lead_ad_funnel with (security_invoker = true) as
select
  l.ad_id,
  coalesce(m.vehicle_label, max(l.vehicle_name))                                  as veiculo,
  coalesce(m.ad_name, max(l.ad_headline))                                         as anuncio,
  count(*)                                                                        as leads,
  count(*) filter (where l.ai_intent = 'curioso')                                 as curiosos,
  count(*) filter (where l.score >= 60)                                           as qualificados,
  count(*) filter (where coalesce(l.ai_temperature, l.qualification) = 'quente')  as quentes,
  count(*) filter (where l.stage in ('Proposta', 'Negociação'))                   as em_proposta,
  count(*) filter (where l.stage = 'VENDIDO!')                                    as vendas,
  coalesce(sum(l.sale_value) filter (where l.stage = 'VENDIDO!'), 0)              as receita,
  min(l.created_at)                                                               as primeiro_lead,
  max(l.created_at)                                                               as ultimo_lead
from public.leads l
left join public.meta_ads m on m.ad_id = l.ad_id
where l.ad_id is not null
group by l.ad_id, m.vehicle_label, m.ad_name;

drop view if exists public.v_lead_intel;
create view public.v_lead_intel with (security_invoker = true) as
select
  l.id as lead_id,
  l.name,
  l.created_at,
  l.stage,
  l.ad_id,
  coalesce(m.vehicle_label, l.vehicle_name)    as veiculo,
  l.score,
  coalesce(l.ai_temperature, l.qualification)  as temperatura,
  l.ai_intent                                  as intencao,
  l.ai_summary                                 as resumo,
  l.ai_profile                                 as perfil,
  l.hot_alerted_at,
  fi.first_in,
  fr.first_reply,
  round(extract(epoch from (fr.first_reply - fi.first_in)) / 60)::int as min_ate_primeira_resposta,
  fi.last_in,
  round(extract(epoch from (now() - fi.last_in)) / 3600)::int           as horas_sem_msg_do_cliente,
  coalesce(fi.msgs_cliente, 0)                 as msgs_cliente
from public.leads l
left join public.meta_ads m on m.ad_id = l.ad_id
left join lateral (select min(created_at) first_in, max(created_at) last_in, count(*) msgs_cliente
                   from public.messages x where x.lead_id = l.id and not x.from_me) fi on true
left join lateral (select min(created_at) first_reply
                   from public.messages x where x.lead_id = l.id and x.from_me and x.created_at > fi.first_in) fr on true;
