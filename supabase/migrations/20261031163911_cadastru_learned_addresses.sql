create table public.cadastru_learned_addresses (
  address_key text primary key,
  original_address jsonb not null,
  target_address jsonb not null,
  property_identity text not null,
  disabled boolean not null default false,
  verified_at timestamptz not null default now()
);
alter table public.cadastru_learned_addresses enable row level security;
revoke all on public.cadastru_learned_addresses from public, anon, authenticated;
grant select, insert, update on public.cadastru_learned_addresses to service_role;
create policy service_only on public.cadastru_learned_addresses for all to service_role using (true) with check (true);

create function public.learn_cadastru_address(p_key text, p_original jsonb, p_target jsonb, p_identity text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.cadastru_learned_addresses(address_key, original_address, target_address, property_identity)
  values (p_key, p_original, p_target, p_identity)
  on conflict (address_key) do update set
    disabled = public.cadastru_learned_addresses.disabled
      or public.cadastru_learned_addresses.target_address <> excluded.target_address
      or public.cadastru_learned_addresses.property_identity <> excluded.property_identity,
    verified_at = now();
$$;
revoke all on function public.learn_cadastru_address(text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.learn_cadastru_address(text,jsonb,jsonb,text) to service_role;
