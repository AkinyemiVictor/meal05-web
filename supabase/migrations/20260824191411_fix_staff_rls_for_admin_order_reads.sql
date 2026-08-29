create or replace function public.is_admin()
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
      and lower(coalesce(u.role, '')) in ('admin', 'super_admin', 'superadmin')
  );
$$;

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

revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

comment on function public.is_admin() is
  'Returns true for active Meal05 admin workspace roles based on public.users, rather than the Supabase JWT role claim.';
comment on function public.is_staff() is
  'Returns true for active Meal05 dispatcher/admin workspace roles based on public.users, rather than the Supabase JWT role claim.';

drop policy if exists "Admins can view and update all users" on public.users;
create policy "Admins can view and update all users"
on public.users
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can view and manage all orders" on public.orders;
create policy "Admins can view and manage all orders"
on public.orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Staff can update delivery status" on public.deliveries;
create policy "Staff can update delivery status"
on public.deliveries
for update
to authenticated
using (public.is_staff())
with check (public.is_staff());;
