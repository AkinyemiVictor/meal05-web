alter table public.waitlist add column marketing_consent boolean not null default false;
alter table public.waitlist add column consent_at timestamptz;
alter table public.waitlist add column utm_source text;
alter table public.waitlist add column utm_medium text;
alter table public.waitlist add column utm_campaign text;
alter table public.waitlist add column unsubscribed_at timestamptz;;
