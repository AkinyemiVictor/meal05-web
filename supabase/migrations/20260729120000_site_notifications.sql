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

alter table public.site_notifications enable row level security;

drop policy if exists "site_notifications_service_role_all" on public.site_notifications;
create policy "site_notifications_service_role_all"
  on public.site_notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
