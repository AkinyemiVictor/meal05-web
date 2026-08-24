create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where (u.auth_id = auth.uid() or u.id = auth.uid())
      and u.is_active = true
      and lower(coalesce(u.role, '')) in ('dispatcher', 'staff', 'admin', 'super_admin', 'superadmin')
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

comment on function public.is_staff() is
  'Returns true for active Meal05 dispatcher/admin workspace roles based on public.users, rather than the Supabase JWT role claim.';
