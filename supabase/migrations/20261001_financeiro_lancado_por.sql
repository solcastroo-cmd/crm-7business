-- Rastreia quem lançou / editou cada registro financeiro
alter table store_expenses        add column if not exists lancado_por text, add column if not exists editado_por text;
alter table vehicle_expenses      add column if not exists lancado_por text, add column if not exists editado_por text;
alter table despesas_implantacao  add column if not exists lancado_por text, add column if not exists editado_por text;
alter table store_income          add column if not exists lancado_por text, add column if not exists editado_por text;
