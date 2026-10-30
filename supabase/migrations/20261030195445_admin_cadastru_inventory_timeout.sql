-- Allow a cold inventory scan without changing global or role-level timeouts.
alter function public.admin_cadastru_inventory_stats(text) set statement_timeout = '30s';
notify pgrst, 'reload schema';
