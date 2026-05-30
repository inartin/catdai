-- estimate_log.estimate_type — split sale and rent valuation analytics

alter table if exists estimate_log
  add column if not exists estimate_type text not null default 'sale';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_log_estimate_type_check'
  ) then
    alter table estimate_log
      add constraint estimate_log_estimate_type_check
      check (estimate_type in ('sale', 'rent'));
  end if;
end $$;

create index if not exists idx_estimate_log_type_created
  on estimate_log (estimate_type, created_at desc);
