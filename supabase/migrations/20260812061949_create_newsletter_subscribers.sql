create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'active',
  source text not null default 'website-footer',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_subscribers_email_normalized check (email = lower(btrim(email))),
  constraint newsletter_subscribers_status_valid check (status in ('active', 'unsubscribed'))
);
comment on table public.newsletter_subscribers is
  'Email addresses that explicitly subscribed to Meal05 newsletters and promotional updates.';
create index newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status, subscribed_at desc);
alter table public.newsletter_subscribers enable row level security;
create policy newsletter_subscribers_no_direct_access
  on public.newsletter_subscribers
  for all
  to anon, authenticated
  using (false)
  with check (false);
revoke all on table public.newsletter_subscribers from anon, authenticated;
grant all on table public.newsletter_subscribers to service_role;
