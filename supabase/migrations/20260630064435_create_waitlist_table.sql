create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  country text not null default 'NG',
  city text,
  source text,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  constraint waitlist_contact_present check (email is not null or phone is not null),
  constraint waitlist_status_valid check (status in ('pending','contacted','converted','unsubscribed'))
);

comment on table public.waitlist is 'Pre-launch / early-access signups captured from the landing page. Public can insert; only admins can read or manage.';

create unique index waitlist_email_unique on public.waitlist (lower(email)) where email is not null;
create unique index waitlist_phone_unique on public.waitlist (phone) where phone is not null;
create index waitlist_created_at_idx on public.waitlist (created_at desc);
create index waitlist_status_idx on public.waitlist (status);

alter table public.waitlist enable row level security;

create policy waitlist_admin_all on public.waitlist
  for all to authenticated
  using (is_admin_user())
  with check (is_admin_user());

create policy waitlist_public_insert on public.waitlist
  for insert to public
  with check (true);
