-- Atribuição de anúncio (Click-to-WhatsApp) por lead.
-- Aplicada em produção em 2026-10-17 (migration "leads_ad_attribution").
alter table public.leads
  add column if not exists ctwa_clid text,
  add column if not exists ad_id text,
  add column if not exists ad_headline text,
  add column if not exists ad_source_url text,
  add column if not exists ad_referral jsonb;

create index if not exists leads_ad_id_idx on public.leads (ad_id) where ad_id is not null;

-- Funil por anúncio: junta com o gasto do Meta pelo ad_id (Windsor: campo ad_id).
create or replace view public.v_lead_ad_funnel with (security_invoker = true) as
select
  ad_id,
  max(ad_headline)                                                        as ad_headline,
  count(*)                                                                as leads,
  count(*) filter (where score >= 60)                                     as qualificados,
  count(*) filter (where qualification = 'quente')                        as quentes,
  count(*) filter (where stage in ('Proposta', 'Negociação'))             as em_proposta,
  count(*) filter (where stage = 'VENDIDO!')                              as vendas,
  coalesce(sum(sale_value) filter (where stage = 'VENDIDO!'), 0)          as receita,
  min(created_at)                                                         as primeiro_lead,
  max(created_at)                                                         as ultimo_lead
from public.leads
where ad_id is not null
group by ad_id;
