-- Transaction-safe delivery route creation.
-- This RPC is intended to be called only by trusted server-side code after
-- authenticating the dispatcher/admin session.

create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists active_delivery_route_id uuid null references public.delivery_routes(id) on delete set null;

create index if not exists orders_active_delivery_route_id_idx
  on public.orders(active_delivery_route_id)
  where active_delivery_route_id is not null;

comment on column public.orders.active_delivery_route_id is
  'Currently active delivery route containing this order. Cleared when the route completes, fails, or is cancelled.';

create or replace function public.clear_order_active_delivery_route()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('completed', 'cancelled', 'failed')
     and old.status is distinct from new.status then
    update public.orders
    set active_delivery_route_id = null,
        updated_at = now()
    where active_delivery_route_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_order_active_delivery_route on public.delivery_routes;
create trigger trg_clear_order_active_delivery_route
after update of status on public.delivery_routes
for each row
execute function public.clear_order_active_delivery_route();

create or replace function public.prevent_duplicate_active_route_stop()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_route uuid;
begin
  select o.active_delivery_route_id
    into current_route
  from public.orders o
  where o.id = new.order_id
  for update;

  if current_route is not null and current_route <> new.route_id then
    raise exception 'order % is already assigned to active delivery route %', new.order_id, current_route;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_active_route_stop on public.delivery_route_stops;
create trigger trg_prevent_duplicate_active_route_stop
before insert or update of order_id, route_id on public.delivery_route_stops
for each row
execute function public.prevent_duplicate_active_route_stop();

drop function if exists public.create_delivery_route_transaction(
  uuid,
  integer[],
  uuid,
  text,
  timestamptz,
  text,
  numeric,
  numeric,
  text,
  text,
  integer,
  boolean,
  text,
  text
);

create function public.create_delivery_route_transaction(
  p_actor_user_id uuid,
  p_order_ids integer[],
  p_delivery_partner_id uuid default null,
  p_vehicle_type text default null,
  p_planned_start_time timestamptz default null,
  p_pickup_location text default null,
  p_agreed_partner_payment numeric default null,
  p_other_delivery_cost numeric default 0,
  p_notes text default null,
  p_hash_secret text default null,
  p_token_expires_hours integer default 48,
  p_require_pin boolean default true,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_actor_user_id);
  v_actor_role text;
  v_route public.delivery_routes%rowtype;
  v_partner public.delivery_partners%rowtype;
  v_order public.orders%rowtype;
  v_order_count integer := 0;
  v_delivery_fees numeric(12,2) := 0;
  v_order_ids integer[];
  v_stop_id uuid;
  v_stop_number integer := 0;
  v_otp text;
  v_token text := null;
  v_token_hash text := null;
  v_pin text := null;
  v_pin_hash text := null;
  v_token_expires_at timestamptz := null;
  v_access_token_id uuid := null;
  v_customer_messages jsonb := '[]'::jsonb;
  v_stops jsonb := '[]'::jsonb;
  v_order_delivery_status text;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if auth.uid() is not null and p_actor_user_id is not null and auth.uid() <> p_actor_user_id then
    raise exception 'actor mismatch';
  end if;

  select u.role
    into v_actor_role
  from public.users u
  where (u.auth_id = v_actor or u.id = v_actor)
    and u.is_active = true
  limit 1;

  if v_actor_role not in ('dispatcher', 'admin', 'super_admin', 'superadmin') then
    raise exception 'forbidden: dispatcher role required';
  end if;

  if p_hash_secret is null or length(p_hash_secret) < 16 then
    raise exception 'hash secret is required';
  end if;

  select array_agg(input.id order by input.ordinality)
    into v_order_ids
  from unnest(coalesce(p_order_ids, '{}'::integer[])) with ordinality as input(id, ordinality)
  where input.id is not null and input.id > 0;

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    raise exception 'select at least one order';
  end if;

  if array_length(v_order_ids, 1) <> array_length(p_order_ids, 1)
     or (select count(distinct input.id) from unnest(v_order_ids) as input(id)) <> array_length(v_order_ids, 1) then
    raise exception 'duplicate or invalid order ids are not allowed';
  end if;

  if array_length(v_order_ids, 1) > 30 then
    raise exception 'a route can contain at most 30 stops';
  end if;

  if p_vehicle_type is not null and p_vehicle_type not in ('motorcycle', 'napep', 'korope', 'car', 'van', 'other') then
    raise exception 'unsupported vehicle type: %', p_vehicle_type;
  end if;

  if p_delivery_partner_id is null then
    raise exception 'select an active delivery partner';
  end if;

  if p_delivery_partner_id is not null then
    select *
      into v_partner
    from public.delivery_partners p
    where p.id = p_delivery_partner_id
      and coalesce(p.is_active, true) = true
    for update;

    if not found then
      raise exception 'delivery partner not found or inactive';
    end if;
  end if;

  for v_order in
    select *
    from public.orders o
    where o.id = any(v_order_ids)
    order by array_position(v_order_ids, o.id)
    for update
  loop
    v_order_count := v_order_count + 1;

    if lower(coalesce(v_order.status, '')) in ('cancelled', 'payment_failed', 'stock_failed') then
      raise exception 'order % cannot be routed because status is %', v_order.id, v_order.status;
    end if;

    if lower(coalesce(v_order.payment_status, '')) = 'failed' then
      raise exception 'order % cannot be routed because payment failed', v_order.id;
    end if;

    if lower(coalesce(v_order.delivery_status, '')) in ('delivered', 'returned', 'delivery_attempt_failed') then
      raise exception 'order % cannot be routed because delivery status is %', v_order.id, v_order.delivery_status;
    end if;

    if v_order.active_delivery_route_id is not null then
      raise exception 'order % is already assigned to active delivery route %', v_order.id, v_order.active_delivery_route_id;
    end if;

    v_delivery_fees := v_delivery_fees + coalesce(v_order.delivery_fee, 0);
  end loop;

  if v_order_count <> array_length(v_order_ids, 1) then
    raise exception 'one or more selected orders were not found';
  end if;

  insert into public.delivery_routes (
    delivery_partner_id,
    status,
    vehicle_type,
    planned_start_time,
    pickup_location,
    agreed_partner_payment,
    delivery_fees_collected,
    other_delivery_cost,
    notes,
    created_by
  )
  values (
    p_delivery_partner_id,
    'assigned',
    coalesce(p_vehicle_type, v_partner.vehicle_type),
    p_planned_start_time,
    nullif(trim(coalesce(p_pickup_location, '')), ''),
    p_agreed_partner_payment,
    v_delivery_fees,
    coalesce(p_other_delivery_cost, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_actor
  )
  returning * into v_route;

  update public.orders
  set active_delivery_route_id = v_route.id,
      delivery_status = 'assigned_to_delivery_partner',
      updated_at = now()
  where id = any(v_order_ids);

  for v_order in
    select *
    from public.orders o
    where o.id = any(v_order_ids)
    order by array_position(v_order_ids, o.id)
  loop
    v_stop_number := v_stop_number + 1;
    v_otp := lpad((mod(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint, 1000000))::text, 6, '0');

    insert into public.delivery_route_stops (
      route_id,
      order_id,
      stop_number,
      customer_id,
      customer_name,
      customer_phone,
      delivery_address,
      delivery_landmark,
      status,
      delivery_otp_hash,
      otp_expires_at,
      delivery_notes
    )
    values (
      v_route.id,
      v_order.id,
      v_stop_number,
      v_order.user_id,
      coalesce(nullif(v_order.delivery_contact_name, ''), 'Meal05 customer'),
      coalesce(nullif(v_order.delivery_contact_phone, ''), 'Not provided'),
      coalesce(nullif(v_order.delivery_address, ''), concat_ws(', ', nullif(v_order.delivery_house_number, ''), nullif(v_order.delivery_street, ''), nullif(v_order.delivery_landmark, '')), 'Address not provided'),
      nullif(v_order.delivery_landmark, ''),
      case when v_stop_number = 1 then 'next' else 'pending' end,
      encode(hmac('delivery-otp:' || v_route.id::text || ':' || v_order.id::text || ':' || v_otp, p_hash_secret, 'sha256'), 'hex'),
      now() + interval '72 hours',
      nullif(v_order.delivery_instructions, '')
    )
    returning id into v_stop_id;

    v_customer_messages := v_customer_messages || jsonb_build_array(jsonb_build_object(
      'orderId', v_order.id,
      'orderReference', coalesce(v_order.order_reference, v_order.id::text),
      'customerId', v_order.user_id,
      'otp', v_otp,
      'message', 'Meal05 delivery OTP for order ' || coalesce(v_order.order_reference, v_order.id::text) || ': ' || v_otp || '. Do not share it until your order is with you.'
    ));

    v_stops := v_stops || jsonb_build_array(jsonb_build_object(
      'id', v_stop_id,
      'order_id', v_order.id,
      'stop_number', v_stop_number,
      'status', case when v_stop_number = 1 then 'next' else 'pending' end
    ));
  end loop;

  if p_delivery_partner_id is not null then
    v_token := replace(replace(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+', '-'), '/', '_');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
    if p_require_pin then
      v_pin := lpad((mod(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint, 10000))::text, 4, '0');
      v_pin_hash := encode(hmac('rider-pin:' || v_route.id::text || ':' || v_pin, p_hash_secret, 'sha256'), 'hex');
    end if;
    v_token_expires_at := now() + make_interval(hours => greatest(1, least(coalesce(p_token_expires_hours, 48), 168)));

    insert into public.delivery_access_tokens (
      route_id,
      delivery_partner_id,
      token_hash,
      pin_hash,
      expires_at
    )
    values (
      v_route.id,
      p_delivery_partner_id,
      v_token_hash,
      v_pin_hash,
      v_token_expires_at
    )
    returning id into v_access_token_id;
  end if;

  insert into public.delivery_audit_logs (
    route_id,
    actor_user_id,
    actor_type,
    action,
    new_value,
    ip_address,
    user_agent
  )
  values (
    v_route.id,
    v_actor,
    'dispatcher',
    'route_created',
    jsonb_build_object(
      'route_id', v_route.id,
      'route_code', v_route.route_code,
      'order_ids', v_order_ids,
      'delivery_partner_id', p_delivery_partner_id,
      'access_token_id', v_access_token_id
    ),
    p_ip_address,
    p_user_agent
  );

  if v_access_token_id is not null then
    insert into public.delivery_audit_logs (
      route_id,
      actor_user_id,
      actor_type,
      action,
      new_value,
      ip_address,
      user_agent
    )
    values (
      v_route.id,
      v_actor,
      'dispatcher',
      'token_generated',
      jsonb_build_object('token_id', v_access_token_id, 'expires_at', v_token_expires_at),
      p_ip_address,
      p_user_agent
    );
  end if;

  return jsonb_build_object(
    'route', jsonb_build_object(
      'id', v_route.id,
      'route_code', v_route.route_code,
      'status', v_route.status,
      'delivery_partner_id', v_route.delivery_partner_id,
      'vehicle_type', v_route.vehicle_type,
      'planned_start_time', v_route.planned_start_time,
      'pickup_location', v_route.pickup_location,
      'agreed_partner_payment', v_route.agreed_partner_payment,
      'delivery_fees_collected', v_route.delivery_fees_collected,
      'delivery_margin', v_route.delivery_margin
    ),
    'stops', v_stops,
    'customerOtpMessages', v_customer_messages,
    'assignment', case when v_access_token_id is null then null else jsonb_build_object(
      'token', v_token,
      'pin', v_pin,
      'expiresAt', v_token_expires_at,
      'routeCode', v_route.route_code
    ) end
  );
end;
$$;

revoke execute on function public.create_delivery_route_transaction(
  uuid,
  integer[],
  uuid,
  text,
  timestamptz,
  text,
  numeric,
  numeric,
  text,
  text,
  integer,
  boolean,
  text,
  text
) from anon, authenticated, public;

grant execute on function public.create_delivery_route_transaction(
  uuid,
  integer[],
  uuid,
  text,
  timestamptz,
  text,
  numeric,
  numeric,
  text,
  text,
  integer,
  boolean,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';
