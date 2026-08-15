create table if not exists public.site_notifications (
  id bigserial primary key,
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  severity text not null default 'warning' check (severity in ('success', 'warning', 'error')),
  is_active boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index if not exists site_notifications_active_window_idx
  on public.site_notifications (is_active, starts_at, expires_at, updated_at desc);

create index if not exists site_notifications_updated_idx
  on public.site_notifications (updated_at desc);

create index if not exists site_notifications_created_by_idx
  on public.site_notifications (created_by) where created_by is not null;

create index if not exists site_notifications_updated_by_idx
  on public.site_notifications (updated_by) where updated_by is not null;

alter table public.site_notifications enable row level security;

revoke all on table public.site_notifications from anon, authenticated;
grant select, insert, update, delete on table public.site_notifications to service_role;
grant usage, select on sequence public.site_notifications_id_seq to service_role;

drop policy if exists "site_notifications_service_role_all" on public.site_notifications;
create policy "site_notifications_service_role_all"
  on public.site_notifications
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.site_notifications is
  'Admin-managed storefront notices. Public rendering is performed by trusted server code.';
