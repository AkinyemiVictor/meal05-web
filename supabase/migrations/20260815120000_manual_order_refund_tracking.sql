create table if not exists public.order_support_cases (
  id bigserial primary key,
  order_id integer not null references public.orders(id) on delete cascade,
  user_id uuid,
  case_type text not null check (case_type in ('refund', 'replacement', 'return')),
  case_status text not null default 'open'
    check (case_status in ('open', 'reviewing', 'approved', 'rejected', 'resolved', 'cancelled')),
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  refund_status text not null default 'not_required'
    check (refund_status in ('pending', 'refunded', 'not_required')),
  refund_method text check (refund_method is null or refund_method = 'bank_transfer'),
  refund_reference text,
  refunded_at timestamptz,
  refunded_by_user_id uuid references auth.users(id) on delete set null,
  refunded_by_email text,
  reason text not null check (length(trim(reason)) >= 2),
  customer_note text,
  admin_note text,
  replacement_order_id integer references public.orders(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_email text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (replacement_order_id is null or replacement_order_id <> order_id),
  check (refund_status <> 'refunded' or (refund_amount > 0 and refunded_at is not null)),
  check (case_type = 'refund' or refund_status = 'not_required')
);

create index if not exists order_support_cases_order_idx
  on public.order_support_cases (order_id, updated_at desc);

create index if not exists order_support_cases_queue_idx
  on public.order_support_cases (case_status, refund_status, requested_at desc);

create index if not exists order_support_cases_replacement_order_idx
  on public.order_support_cases (replacement_order_id) where replacement_order_id is not null;

create index if not exists order_support_cases_created_by_idx
  on public.order_support_cases (created_by_user_id) where created_by_user_id is not null;

create index if not exists order_support_cases_updated_by_idx
  on public.order_support_cases (updated_by_user_id) where updated_by_user_id is not null;

create index if not exists order_support_cases_refunded_by_idx
  on public.order_support_cases (refunded_by_user_id) where refunded_by_user_id is not null;

alter table public.order_support_cases enable row level security;

revoke all on table public.order_support_cases from anon, authenticated;
grant select, insert, update, delete on table public.order_support_cases to service_role;
grant usage, select on sequence public.order_support_cases_id_seq to service_role;

drop policy if exists "order_support_cases_service_role_all" on public.order_support_cases;
create policy "order_support_cases_service_role_all"
  on public.order_support_cases
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.order_support_cases is
  'Admin-only support and manual bank-refund tracking. Rows record decisions but never initiate money movement.';

comment on column public.order_support_cases.refund_status is
  'pending until an admin confirms the external bank transfer, then refunded; not_required closes the case without a refund.';
