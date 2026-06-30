


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."ripeness_enum" AS ENUM (
    'ripe',
    'unripe'
);


ALTER TYPE "public"."ripeness_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_stock_movement_v2"("variant_id_input" bigint, "change_qty_input" integer, "reason_input" "text", "source_input" "text" DEFAULT NULL::"text", "note_input" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if change_qty_input = 0 then
    return;
  end if;

  -- update stock_count safely (never allow negative)
  update public.product_variants_v2
  set stock_count = stock_count + change_qty_input,
      updated_at = now()
  where id = variant_id_input
    and (stock_count + change_qty_input) >= 0;

  if not found then
    raise exception 'Stock update failed: invalid variant_id or would go negative';
  end if;

  -- log movement
  insert into public.stock_movements_v2 (variant_id, change_qty, reason, source, note)
  values (variant_id_input, change_qty_input, reason_input, source_input, note_input);
end $$;


ALTER FUNCTION "public"."apply_stock_movement_v2"("variant_id_input" bigint, "change_qty_input" integer, "reason_input" "text", "source_input" "text", "note_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_role"("auth_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- only logged-in admin can assign roles
  if not public.is_admin() then
    raise exception 'forbidden: only admin may assign roles';
  end if;

  update auth.users
  set raw_user_meta_data =
        coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', new_role)
  where id = auth_id;
end;
$$;


ALTER FUNCTION "public"."assign_role"("auth_id" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_user_cart"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  new_order_id integer;
begin
  -- 1. Create order
  insert into public.orders (user_id, status, created_at, updated_at, total)
  values (p_user_id, 'pending', now(), now(), 0)
  returning id into new_order_id;

  -- 2. Copy cart items into order_items
  insert into public.order_items (order_id, product_id, quantity, price)
  select 
    new_order_id,
    c.product_id,
    c.quantity,
    coalesce(p.price, 0)
  from public.cart_items c
  join public.products p on c.product_id = p.id
  where c.user_id = p_user_id;

  -- 🟢 3. Reduce product stock here
  perform public.decrease_product_stock(new_order_id);

  -- 4. Update order total and status
  update public.orders
  set total = (
    select coalesce(sum(oi.quantity * oi.price), 0)
    from public.order_items oi
    where oi.order_id = new_order_id
  ),
  status = 'paid',
  updated_at = now()
  where id = new_order_id;

  -- 5. Clear cart
  delete from public.cart_items where user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."checkout_user_cart"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_order_on_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- When delivery status changes to 'delivered', mark order completed
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    update public.orders
    set status = 'completed',
        updated_at = now()
    where id = new.order_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."complete_order_on_delivery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_delivery_after_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only create a delivery if status changes to 'paid'
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.deliveries (order_id, status, created_at)
    values (new.id, 'pending', now());
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_delivery_after_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_user"("auth_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not is_staff() then
    raise exception 'forbidden: only staff or admin may deactivate accounts';
  end if;

  update public.users
  set is_active = false, updated_at = now()
  where id = auth_id;
end;
$$;


ALTER FUNCTION "public"."deactivate_user"("auth_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrease_product_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.products
  set stock = stock - new.quantity
  where id = new.product_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."decrease_product_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrease_product_stock"("p_order_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  insufficient_stock record;
begin
  -- Check for any product with not enough stock
  select p.id, p.name, p.stock, oi.quantity
  into insufficient_stock
  from public.products p
  join public.order_items oi on p.id = oi.product_id
  where oi.order_id = p_order_id
  and p.stock < oi.quantity
  limit 1;

  -- If any item is insufficient, cancel checkout
  if found then
    raise exception 'Not enough stock for product "%". Available: %, requested: %',
      insufficient_stock.name, insufficient_stock.stock, insufficient_stock.quantity;
  end if;

  -- Otherwise, deduct normally
  update public.products p
  set stock = stock - oi.quantity
  from public.order_items oi
  where oi.product_id = p.id
  and oi.order_id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."decrease_product_stock"("p_order_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrease_product_stock"("p_order_id" integer, "p_reason" "text" DEFAULT 'checkout'::"text", "p_deducted_by" "text" DEFAULT 'system'::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  insufficient_stock record;
begin
  -- 1. Check for insufficient stock
  select p.id, p.name, p.stock, oi.quantity
  into insufficient_stock
  from public.products p
  join public.order_items oi on p.id = oi.product_id
  where oi.order_id = p_order_id
  and p.stock < oi.quantity
  limit 1;

  if found then
    raise exception 'Not enough stock for product "%". Available: %, requested: %',
      insufficient_stock.name, insufficient_stock.stock, insufficient_stock.quantity;
  end if;

  -- 2. Deduct stock
  update public.products p
  set stock = stock - oi.quantity,
      updated_at = now()
  from public.order_items oi
  where oi.product_id = p.id
  and oi.order_id = p_order_id;

  -- 3. Log deduction details
  insert into public.stock_deduction_log (product_id, quantity, reason, deducted_by)
  select 
    oi.product_id,
    oi.quantity,
    p_reason,
    p_deducted_by
  from public.order_items oi
  where oi.order_id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."decrease_product_stock"("p_order_id" integer, "p_reason" "text", "p_deducted_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_stock_for_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  current_stock numeric;
begin
  for r in
    select
      oi.product_variant_id,
      oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    -- lock row so concurrent orders can't oversell
    select pv.stock_count
      into current_stock
    from public.product_variants pv
    where pv.id = r.product_variant_id
    for update;

    if current_stock is null then
      raise exception 'Variant % not found', r.product_variant_id;
    end if;

    if current_stock < r.quantity then
      raise exception 'Insufficient stock for variant % (have %, need %)',
        r.product_variant_id, current_stock, r.quantity;
    end if;

    update public.product_variants
      set stock_count = stock_count - r.quantity,
          updated_at = now()
    where id = r.product_variant_id;

    insert into public.inventory_movements (product_variant_id, change_qty, reason, order_id)
    values (r.product_variant_id, -r.quantity, 'order_deduction', p_order_id);
  end loop;
end;
$$;


ALTER FUNCTION "public"."deduct_stock_for_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."default_market_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select id from public.markets where is_default limit 1 $$;


ALTER FUNCTION "public"."default_market_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  seq int;
  datecode text;
begin
  -- Format date as YYYYMMDD
  datecode := to_char(current_date, 'YYYYMMDD');

  -- Count how many orders already exist today
  select count(*) + 1 into seq
  from public.orders
  where to_char(created_at, 'YYYYMMDD') = datecode;

  -- Compose reference: ORD-YYYYMMDD-#### 
  new.order_reference := 'ORD-' || datecode || '-' || lpad(seq::text, 4, '0');

  return new;
end;
$$;


ALTER FUNCTION "public"."generate_order_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_variants_for_product"("p_product_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  attr_ids int[];
  a_rec record;
  opt_rows record;
  opt_arrays jsonb[]; -- array of arrays (jsonb) of option values (as objects with id+value)
  i int;
  comb text;
  combos jsonb;
  current jsonb;
  option_list jsonb;
  sql text;
  -- helper vars
  opt jsonb;
  v_option_ids int[];
  v_option_vals text[];
  option_sets jsonb[];
  idx int;
  prod_base_price numeric;
  prod_base_unit text;
  final_price numeric;
BEGIN
  -- get attributes for this product ordered stable
  SELECT array_agg(attribute_id ORDER BY attribute_id) INTO attr_ids
  FROM product_attributes
  WHERE product_id = p_product_id;

  IF attr_ids IS NULL THEN
    RAISE NOTICE 'No attributes for product %', p_product_id;
    RETURN;
  END IF;

  -- build option_sets: each element is a JSONB array of option objects {id, value}
  option_sets := ARRAY[]::jsonb[];
  FOREACH i IN ARRAY attr_ids LOOP
    option_list := (
      SELECT jsonb_agg(jsonb_build_object('id', ao.id, 'value', ao.value))
      FROM attribute_options ao
      WHERE ao.attribute_id = i
      ORDER BY ao.id
    );
    option_sets := option_sets || option_list;
  END LOOP;

  -- function to recursively build cartesian product using jsonb
  WITH RECURSIVE cart(idx, choice) AS (
    SELECT 1 AS idx, jsonb '[]' AS choice
    UNION ALL
    SELECT idx+1 AS idx,
           choice || jsonb_build_array(opt)  -- append chosen option (object) to array
    FROM cart, LATERAL (
      SELECT elem AS opt FROM jsonb_array_elements(option_sets[idx]) AS elem
    ) t
    WHERE idx <= array_length(option_sets,1)
  )
  SELECT jsonb_agg(choice) INTO combos FROM cart WHERE idx = array_length(option_sets,1)+1;

  IF combos IS NULL THEN
    RAISE NOTICE 'No combos generated for product %', p_product_id;
    RETURN;
  END IF;

  -- load product base price/unit
  SELECT base_price, COALESCE(base_unit,'kg') INTO prod_base_price, prod_base_unit FROM products WHERE id = p_product_id;

  -- for each combo insert if not exists
  FOR i IN SELECT generate_series(1, jsonb_array_length(combos)) LOOP
    current := combos->(i-1);
    -- build combination JSON keyed by attribute names
    -- fetch attribute names in same order
    comb := '{}'::text;
    comb := '{}'::text; -- start with empty
    FOR idx IN 1..array_length(attr_ids,1) LOOP
      SELECT name INTO a_rec FROM attributes WHERE id = attr_ids[idx];
      -- current[idx-1] is option obj
      opt := current->(idx-1);
      comb := (comb::jsonb || jsonb_build_object(a_rec.name, opt->>'value'))::text;
    END LOOP;

    -- compute price: start with base_price; apply multipliers for any matched option
    final_price := prod_base_price;
    -- apply modifiers if any
    FOR idx IN 1..array_length(attr_ids,1) LOOP
      opt := current->(idx-1);
      -- get option id
      PERFORM 1;
      SELECT apm.modifier_type, apm.modifier_value INTO opt_rows
      FROM attribute_price_modifiers apm
      WHERE apm.attribute_option_id = (opt->>'id')::int
      LIMIT 1;

      IF FOUND THEN
        IF opt_rows.modifier_type = 'multiplier' THEN
          final_price := final_price * opt_rows.modifier_value;
        ELSE
          final_price := final_price + opt_rows.modifier_value;
        END IF;
      END IF;
    END LOOP;

    -- ensure a row doesn't already exist with same product_id + combination
    IF NOT EXISTS (
      SELECT 1 FROM product_variants pv
      WHERE pv.product_id = p_product_id
        AND pv.combination = comb::jsonb
    ) THEN
      INSERT INTO product_variants (product_id, combination, price, stock, unit, created_at)
      VALUES (p_product_id, comb::jsonb, COALESCE(final_price, prod_base_price), 1000, prod_base_unit, now());
    END IF;
  END LOOP;

END;
$$;


ALTER FUNCTION "public"."generate_variants_for_product"("p_product_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_deleted_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.users where id = old.id;
  return old;
end;
$$;


ALTER FUNCTION "public"."handle_deleted_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.users (id, auth_id, name, created_at)
  values (
    new.id,                 -- same UUID as auth.users.id
    new.id,                 -- same value stored in auth_id
    coalesce(new.raw_user_meta_data->>'name', ''), -- optional if metadata exists
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.users
  set
    name = coalesce(new.raw_user_meta_data->>'name', public.users.name),
    email = coalesce(new.email, public.users.email),
    phone = coalesce(new.phone, public.users.phone),
    updated_at = now()
  where id = new.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce((auth.jwt() ->> 'role') in ('admin','superadmin'), false);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.auth_id = (SELECT auth.uid()) OR u.id = (SELECT auth.uid()))
      AND u.role IN ('admin','superadmin')
      AND COALESCE(u.is_active, true)
  );
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin_user"() IS 'True if the current user is an active admin (reads users.role). SECURITY DEFINER to avoid RLS recursion. Used in RLS policies.';



CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce((auth.jwt() ->> 'role') in ('admin','superadmin','staff'), false);
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_manual_restock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only log if stock increased
  if new.stock > old.stock then
    insert into public.restock_log (product_id, quantity, restocked_by)
    values (new.id, new.stock - old.stock, 'manual_edit');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_manual_restock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_restock_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.stock > old.stock then
    insert into public.restock_log (product_id, quantity, restocked_by)
    values (new.id, new.stock - old.stock, 'manual');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_restock_on_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_schema_backup"("file_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.schema_backups(filename)
  values (file_name);
end;
$$;


ALTER FUNCTION "public"."log_schema_backup"("file_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_stock_deduction"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.stock < old.stock then
    insert into public.stock_deduction_log (product_id, quantity, reason, deducted_by)
    values (new.id, old.stock - new.stock, 'manual', 'system');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_stock_deduction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_order_paid_after_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only act when payment succeeds
  if new.status = 'successful' and old.status is distinct from 'successful' then
    update public.orders
    set 
      status = 'paid',
      updated_at = now()
    where id = new.order_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."mark_order_paid_after_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_paystack_order_paid"("p_order_id" integer, "p_transaction_ref" "text", "p_amount" numeric, "p_currency_code" "text" DEFAULT 'NGN'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_order public.orders%rowtype;
  v_existing_payment_order integer;
  v_item record;
  v_stock numeric;
  v_variant_market uuid;
  v_reference text := btrim(coalesce(p_transaction_ref, ''));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_item_count integer;
begin
  if v_reference = '' then
    raise exception 'Payment reference is required';
  end if;
  if v_currency = '' then
    raise exception 'Payment currency is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if p_amount is null or p_amount <> v_order.total then
    raise exception 'Payment amount does not match order total';
  end if;
  if v_currency <> upper(v_order.currency_code) then
    raise exception 'Payment currency does not match order currency';
  end if;

  select order_id into v_existing_payment_order
  from public.payments
  where transaction_ref = v_reference;

  if v_existing_payment_order is not null and v_existing_payment_order <> p_order_id then
    raise exception 'Payment reference is already assigned to another order';
  end if;

  if lower(coalesce(v_order.payment_status, '')) = 'paid' then
    if v_order.payment_reference = v_reference or v_existing_payment_order = p_order_id then
      return jsonb_build_object(
        'order_id', p_order_id,
        'transaction_ref', v_reference,
        'already_processed', true,
        'stock_updated', false
      );
    end if;
    raise exception 'Order is already paid with a different payment reference';
  end if;

  select count(*) into v_item_count
  from public.order_items
  where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'Order % has no items', p_order_id;
  end if;
  if exists (
    select 1 from public.order_items
    where order_id = p_order_id and (variant_id is null or quantity is null or quantity <= 0)
  ) then
    raise exception 'Order % contains an invalid item', p_order_id;
  end if;

  for v_item in
    select variant_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id
    group by variant_id
    order by variant_id
  loop
    select stock_count, market_id
      into v_stock, v_variant_market
    from public.product_variants
    where id = v_item.variant_id
    for update;

    if not found then
      raise exception 'Variant % not found', v_item.variant_id;
    end if;
    if v_variant_market <> v_order.market_id then
      raise exception 'Variant % belongs to a different market', v_item.variant_id;
    end if;
    if v_stock is null or v_stock < v_item.quantity then
      raise exception 'Insufficient stock for variant % (have %, need %)',
        v_item.variant_id, coalesce(v_stock, 0), v_item.quantity;
    end if;

    update public.product_variants
    set stock_count = stock_count - v_item.quantity,
        updated_at = now()
    where id = v_item.variant_id;

    insert into public.stock_ledger (variant_id, change_qty, reason, source, note)
    values (
      v_item.variant_id,
      -v_item.quantity,
      'order_deduction',
      'order:' || p_order_id::text,
      'Paystack payment ' || v_reference
    );
  end loop;

  insert into public.payments (
    order_id, amount, method, status, transaction_ref, paid_at, currency_code
  ) values (
    p_order_id, p_amount, 'paystack', 'success', v_reference, now(), v_currency
  )
  on conflict (transaction_ref) do update
    set status = 'success',
        paid_at = excluded.paid_at;

  update public.orders
  set payment_status = 'paid',
      payment_method = 'paystack',
      payment_reference = v_reference,
      payment_verified = true,
      status = 'processing',
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'transaction_ref', v_reference,
    'already_processed', false,
    'stock_updated', true
  );
end;
$$;


ALTER FUNCTION "public"."mark_paystack_order_paid"("p_order_id" integer, "p_transaction_ref" "text", "p_amount" numeric, "p_currency_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_daily_category_performance"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  refresh materialized view concurrently public.mv_daily_category_performance;
$$;


ALTER FUNCTION "public"."refresh_daily_category_performance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_delivery_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."refresh_delivery_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_user_password"("auth_id" "uuid", "new_password" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not is_staff() then
    raise exception 'forbidden: only staff or admin may reset passwords';
  end if;

  insert into public.auth_admin_queue(kind, target_user, payload)
  values ('reset_password', auth_id, jsonb_build_object('new_password', new_password));
end;
$$;


ALTER FUNCTION "public"."reset_user_password"("auth_id" "uuid", "new_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if p_quantity <= 0 then
    raise exception 'Quantity to restock must be greater than zero.';
  end if;

  update public.products
  set stock = stock + p_quantity
  where id = p_product_id;

  if not found then
    raise exception 'Product with id % not found.', p_product_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer, "p_restocked_by" "text" DEFAULT 'system'::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if p_quantity <= 0 then
    raise exception 'Quantity to restock must be greater than zero.';
  end if;

  -- Update stock and timestamp
  update public.products
  set stock = stock + p_quantity,
      updated_at = now()
  where id = p_product_id;

  if not found then
    raise exception 'Product with id % not found.', p_product_id;
  end if;

  -- Log the restock
  insert into public.restock_log (product_id, quantity, restocked_by)
  values (p_product_id, p_quantity, p_restocked_by);
end;
$$;


ALTER FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer, "p_restocked_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_daily_menu_locked_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.status = 'locked' AND OLD.status IS DISTINCT FROM 'locked' AND NEW.locked_at IS NULL THEN
    NEW.locked_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_daily_menu_locked_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_delivered_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- When status changes to 'delivered' for the first time
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_delivered_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_delivery_in_transit_on_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- If agent_id changes from NULL to a valid value, set status
  if old.agent_id is null and new.agent_id is not null then
    new.status := 'in transit';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_delivery_in_transit_on_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_rls"("uid" "uuid", "target_table" "text") RETURNS TABLE("result" "jsonb", "policy_used" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
    query text;
    role_name text;
    policy_name text;
begin
    -- Simulate user context for RLS
    perform set_config('request.jwt.claim.sub', uid::text, true);

    -- Find this user's role
    select role into role_name
    from public.users
    where auth_id = uid
    limit 1;

    -- Identify matching policy name for this table & role
    select policyname into policy_name
    from pg_policies
    where tablename = target_table
      and (roles @> array[role_name]::name[] or roles @> array['authenticated']::name[])
    limit 1;

    -- Build dynamic SQL and attach the policy name to each row
    query := format(
        'select to_jsonb(t), %L as policy_used from %I t',
        coalesce(policy_name, 'No matching policy found'),
        target_table
    );

    -- Return all visible rows + detected policy name
    return query execute query;
end;
$$;


ALTER FUNCTION "public"."test_rls"("uid" "uuid", "target_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_after_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only run when the delivery status becomes 'delivered'
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    update public.orders
    set status = 'completed',
        updated_at = now()
    where id = new.order_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."update_order_after_delivery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status_after_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- When payment succeeds
  if new.status = 'paid' then
    update public.orders
    set status = 'paid',
        updated_at = now()
    where id = new.order_id;

  -- When payment fails
  elsif new.status = 'failed' then
    update public.orders
    set status = 'pending',
        updated_at = now()
    where id = new.order_id;

  -- When payment is refunded
  elsif new.status = 'refunded' then
    update public.orders
    set status = 'cancelled',
        updated_at = now()
    where id = new.order_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."update_order_status_after_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_product_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_product_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_order_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status = 'delivered' and new.status != 'delivered' then
    raise exception 'Delivered orders cannot change status';
  end if;

  if old.status = 'cancelled' and new.status != 'cancelled' then
    raise exception 'Cancelled orders cannot change status';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_order_status_transition"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_logs" (
    "id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" bigint,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" NOT NULL,
    "route" "text",
    "actor" "text",
    "message" "text",
    CONSTRAINT "admin_logs_type_check" CHECK (("type" = ANY (ARRAY['event'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."admin_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_logs" IS 'Audit log of admin actions and system events or errors.';



ALTER TABLE "public"."admin_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."admin_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."attribute_options" (
    "id" integer NOT NULL,
    "attribute_id" integer NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "label" "text"
);


ALTER TABLE "public"."attribute_options" OWNER TO "postgres";


COMMENT ON TABLE "public"."attribute_options" IS 'Allowed values for each product attribute (e.g. Size: Small, Large).';



COMMENT ON COLUMN "public"."attribute_options"."attribute_id" IS 'References attributes.id.';



CREATE SEQUENCE IF NOT EXISTS "public"."attribute_options_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."attribute_options_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."attribute_options_id_seq" OWNED BY "public"."attribute_options"."id";



CREATE TABLE IF NOT EXISTS "public"."attribute_price_modifiers" (
    "id" integer NOT NULL,
    "attribute_option_id" integer NOT NULL,
    "modifier_type" "text" NOT NULL,
    "modifier_value" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "attribute_price_modifiers_modifier_type_check" CHECK (("modifier_type" = ANY (ARRAY['multiplier'::"text", 'additive'::"text"]))),
    CONSTRAINT "attribute_price_modifiers_type_check" CHECK (("modifier_type" = ANY (ARRAY['multiplier'::"text", 'add'::"text", 'set'::"text"]))),
    CONSTRAINT "attribute_price_modifiers_value_check" CHECK (((("modifier_type" = 'multiplier'::"text") AND ("modifier_value" > (0)::numeric)) OR ("modifier_type" = ANY (ARRAY['add'::"text", 'set'::"text"]))))
);


ALTER TABLE "public"."attribute_price_modifiers" OWNER TO "postgres";


COMMENT ON TABLE "public"."attribute_price_modifiers" IS 'Price adjustments tied to an attribute option (multiplier or additive).';



CREATE SEQUENCE IF NOT EXISTS "public"."attribute_price_modifiers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."attribute_price_modifiers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."attribute_price_modifiers_id_seq" OWNED BY "public"."attribute_price_modifiers"."id";



CREATE TABLE IF NOT EXISTS "public"."attributes" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."attributes" OWNER TO "postgres";


COMMENT ON TABLE "public"."attributes" IS 'Configurable product attributes (e.g. Size, Colour, Packaging).';



CREATE SEQUENCE IF NOT EXISTS "public"."attributes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."attributes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."attributes_id_seq" OWNED BY "public"."attributes"."id";



CREATE TABLE IF NOT EXISTS "public"."auth_admin_queue" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "target_user" "uuid" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "auth_admin_queue_kind_check" CHECK (("kind" = 'reset_password'::"text"))
);


ALTER TABLE "public"."auth_admin_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."auth_admin_queue" IS 'Queue of admin auth actions to process, e.g. password resets.';



CREATE SEQUENCE IF NOT EXISTS "public"."auth_admin_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."auth_admin_queue_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."auth_admin_queue_id_seq" OWNED BY "public"."auth_admin_queue"."id";



CREATE TABLE IF NOT EXISTS "public"."banner_urls" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "alt" "text",
    "cta_label" "text",
    "cta_href" "text",
    "is_active" boolean DEFAULT true,
    "title" "text",
    "heading" "text",
    "tag" "text",
    "description" "text",
    "mobile_image_url" "text",
    "sort_order" integer,
    "accent" "text",
    "accent_soft" "text",
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "placement" "text" DEFAULT 'hero'::"text" NOT NULL
);


ALTER TABLE "public"."banner_urls" OWNER TO "postgres";


COMMENT ON TABLE "public"."banner_urls" IS 'Homepage hero banners and timed campaign creatives.';



COMMENT ON COLUMN "public"."banner_urls"."heading" IS 'Display heading for the hero banner. Newlines split into separate heading lines.';



COMMENT ON COLUMN "public"."banner_urls"."tag" IS 'Short eyebrow or campaign tag displayed above the hero title.';



COMMENT ON COLUMN "public"."banner_urls"."mobile_image_url" IS 'Optional mobile-specific hero image.';



COMMENT ON COLUMN "public"."banner_urls"."sort_order" IS 'Manual order for homepage hero rotation.';



COMMENT ON COLUMN "public"."banner_urls"."starts_at" IS 'Optional schedule start time for showing the banner.';



COMMENT ON COLUMN "public"."banner_urls"."expires_at" IS 'Optional schedule end time for showing the banner.';



COMMENT ON COLUMN "public"."banner_urls"."placement" IS 'Display slot for the banner, e.g. hero or advert.';



ALTER TABLE "public"."banner_urls" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."banner_urls_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "product_id" integer,
    "quantity" integer DEFAULT 1,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."cart_items" IS 'Items currently in a shopping cart for a user.';



CREATE SEQUENCE IF NOT EXISTS "public"."cart_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cart_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cart_items_id_seq" OWNED BY "public"."cart_items"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_menu_items" (
    "id" bigint NOT NULL,
    "daily_menu_id" bigint NOT NULL,
    "variant_id" bigint NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "price_today" numeric,
    "cap_qty" integer,
    "sold_qty" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL,
    CONSTRAINT "daily_menu_items_cap_qty_check" CHECK ((("cap_qty" IS NULL) OR ("cap_qty" >= 0))),
    CONSTRAINT "daily_menu_items_price_today_check" CHECK ((("price_today" IS NULL) OR ("price_today" >= (0)::numeric))),
    CONSTRAINT "daily_menu_items_sold_qty_check" CHECK (("sold_qty" >= 0))
);


ALTER TABLE "public"."daily_menu_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_menu_items" IS 'Items on a given day''s menu, with that day''s availability, price, and optional quantity cap.';



COMMENT ON COLUMN "public"."daily_menu_items"."price_today" IS 'Market price set for this item today. Falls back to the variant base price when null.';



COMMENT ON COLUMN "public"."daily_menu_items"."cap_qty" IS 'Optional max units offered today; sold_qty tracks against it.';



ALTER TABLE "public"."daily_menu_items" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."daily_menu_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."daily_menus" (
    "id" bigint NOT NULL,
    "menu_date" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    CONSTRAINT "daily_menus_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'locked'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."daily_menus" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_menus" IS 'One row per trading day. status draft -> locked (frozen at the 4 PM cutoff) -> closed. Drives which fresh items the storefront shows that day.';



COMMENT ON COLUMN "public"."daily_menus"."locked_by" IS 'Admin who locked the menu (audit trail).';



ALTER TABLE "public"."daily_menus" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."daily_menus_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" integer NOT NULL,
    "order_id" integer,
    "contact_phone" "text",
    "vehicle_plate" "text",
    "status" "text" DEFAULT 'awaiting dispatch'::"text",
    "dispatched_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "agent_id" integer,
    "delivery_code" "text",
    "recipient_name" "text",
    "proof_photo_url" "text",
    "proof_note" "text",
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


COMMENT ON TABLE "public"."deliveries" IS 'Delivery records for orders: dispatch, driver, and delivery status.';



COMMENT ON COLUMN "public"."deliveries"."status" IS 'Delivery state: awaiting dispatch, dispatched, delivered.';



COMMENT ON COLUMN "public"."deliveries"."agent_id" IS 'Assigned delivery agent (rider).';



COMMENT ON COLUMN "public"."deliveries"."delivery_code" IS 'One-time code the customer gives the rider to confirm handover.';



COMMENT ON COLUMN "public"."deliveries"."proof_photo_url" IS 'Photo captured as proof of delivery.';



CREATE SEQUENCE IF NOT EXISTS "public"."deliveries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."deliveries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."deliveries_id_seq" OWNED BY "public"."deliveries"."id";



CREATE TABLE IF NOT EXISTS "public"."delivery_agents" (
    "id" integer NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "vehicle_plate" "text",
    "zone" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL
);


ALTER TABLE "public"."delivery_agents" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_agents" IS 'Dispatch riders/drivers who fulfil deliveries.';



COMMENT ON COLUMN "public"."delivery_agents"."zone" IS 'Primary delivery zone the agent covers.';



CREATE SEQUENCE IF NOT EXISTS "public"."delivery_agents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."delivery_agents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."delivery_agents_id_seq" OWNED BY "public"."delivery_agents"."id";



CREATE TABLE IF NOT EXISTS "public"."delivery_settings" (
    "key" "text" NOT NULL,
    "delivery_fee" numeric(12,2) DEFAULT 1500 NOT NULL,
    "free_delivery_threshold" numeric(12,2) DEFAULT 40000 NOT NULL,
    "same_day_enabled" boolean DEFAULT true NOT NULL,
    "same_day_cutoff_time" "text" DEFAULT '14:00'::"text" NOT NULL,
    "service_zones" "text"[] DEFAULT ARRAY['Ibadan'::"text"] NOT NULL,
    "same_day_notice" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "delivery_settings_delivery_fee_check" CHECK (("delivery_fee" >= (0)::numeric)),
    CONSTRAINT "delivery_settings_free_delivery_threshold_check" CHECK (("free_delivery_threshold" >= (0)::numeric)),
    CONSTRAINT "delivery_settings_same_day_cutoff_time_check" CHECK (("same_day_cutoff_time" ~ '^(?:[01]\d|2[0-3]):[0-5]\d$'::"text"))
);


ALTER TABLE "public"."delivery_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_settings" IS 'Storefront delivery fee, free delivery threshold, service zones, and same-day delivery rules.';



COMMENT ON COLUMN "public"."delivery_settings"."same_day_cutoff_time" IS '24-hour HH:MM cutoff in Africa/Lagos time for same-day delivery eligibility.';



COMMENT ON COLUMN "public"."delivery_settings"."service_zones" IS 'List of supported delivery cities or service zones.';



CREATE TABLE IF NOT EXISTS "public"."delivery_zones" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "city" "text" DEFAULT 'Ibadan'::"text" NOT NULL,
    "delivery_fee" numeric DEFAULT 0 NOT NULL,
    "min_order" numeric,
    "eta_note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    CONSTRAINT "delivery_zones_delivery_fee_check" CHECK (("delivery_fee" >= (0)::numeric)),
    CONSTRAINT "delivery_zones_min_order_check" CHECK ((("min_order" IS NULL) OR ("min_order" >= (0)::numeric)))
);


ALTER TABLE "public"."delivery_zones" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_zones" IS 'Delivery areas with per-zone fees and minimums, used for checkout zone validation.';



COMMENT ON COLUMN "public"."delivery_zones"."delivery_fee" IS 'Delivery fee for this zone (NGN).';



COMMENT ON COLUMN "public"."delivery_zones"."min_order" IS 'Optional minimum order subtotal required to deliver to this zone.';



ALTER TABLE "public"."delivery_zones" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."delivery_zones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."markets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "country" "text" NOT NULL,
    "currency_code" "text" NOT NULL,
    "currency_symbol" "text",
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "timezone" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "markets_status_valid" CHECK (("status" = ANY (ARRAY['active'::"text", 'coming_soon'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."markets" OWNER TO "postgres";


COMMENT ON TABLE "public"."markets" IS 'Country markets Meal05 operates in. Each carries its own currency, locale, and timezone. market_id on operational tables scopes data per market.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "order_id" integer,
    "channel" "text" NOT NULL,
    "event" "text",
    "recipient" "text",
    "subject" "text",
    "body" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text", 'push'::"text", 'in_app'::"text"]))),
    CONSTRAINT "notifications_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'read'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'Log of messages sent to customers (WhatsApp/SMS/email/push) with delivery status. Drives confirmations and dispatch alerts.';



COMMENT ON COLUMN "public"."notifications"."event" IS 'Event/template key, e.g. order_received, out_for_delivery, payment_confirmed.';



ALTER TABLE "public"."notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" integer NOT NULL,
    "order_id" integer,
    "product_id" integer,
    "quantity" integer,
    "price" numeric,
    "variant_id" bigint NOT NULL,
    "substituted_variant_id" bigint,
    "substitution_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "substitution_note" "text",
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL,
    CONSTRAINT "order_items_substitution_status_check" CHECK (("substitution_status" = ANY (ARRAY['none'::"text", 'proposed'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_items" IS 'Line items belonging to an order (product variant, quantity, price).';



COMMENT ON COLUMN "public"."order_items"."substituted_variant_id" IS 'If the ordered item was out of stock, the variant actually supplied instead.';



CREATE SEQUENCE IF NOT EXISTS "public"."order_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."order_items_id_seq" OWNED BY "public"."order_items"."id";



CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" bigint NOT NULL,
    "order_id" integer NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_status_history" IS 'Timeline of status changes per order, for support and analytics.';



ALTER TABLE "public"."order_status_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."order_status_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "total" numeric DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_reference" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "payment_reference" "text",
    "payment_verified" boolean DEFAULT false,
    "delivery_status" "text" DEFAULT 'awaiting dispatch'::"text",
    "delivery_date" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "delivery_address" "text",
    "subtotal" numeric(12,2),
    "delivery_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "item_discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "delivery_discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "promo_code" "text",
    "promo_description" "text",
    "fulfillment_type" "text" DEFAULT 'delivery'::"text" NOT NULL,
    "pickup_location_id" bigint,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "allow_substitutions" boolean DEFAULT true NOT NULL,
    "customer_note" "text",
    "delivery_instructions" "text",
    "tax_amount" numeric DEFAULT 0 NOT NULL,
    "tax_rate" numeric,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL,
    CONSTRAINT "orders_fulfillment_type_check" CHECK (("fulfillment_type" = ANY (ARRAY['delivery'::"text", 'pickup'::"text"]))),
    CONSTRAINT "orders_tax_amount_check" CHECK (("tax_amount" >= (0)::numeric)),
    CONSTRAINT "orders_tax_rate_check" CHECK ((("tax_rate" IS NULL) OR ("tax_rate" >= (0)::numeric)))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."orders" IS 'Customer orders with totals, payment, delivery, and fulfilment details.';



COMMENT ON COLUMN "public"."orders"."total" IS 'Final order total after delivery fee and discounts.';



COMMENT ON COLUMN "public"."orders"."status" IS 'Order lifecycle status, e.g. pending, paid, completed.';



COMMENT ON COLUMN "public"."orders"."payment_method" IS 'How the order was paid, e.g. paystack, opay, transfer, cash.';



COMMENT ON COLUMN "public"."orders"."order_reference" IS 'Public human-readable order reference.';



COMMENT ON COLUMN "public"."orders"."payment_status" IS 'Payment state, e.g. unpaid, paid.';



COMMENT ON COLUMN "public"."orders"."payment_verified" IS 'True once payment has been confirmed.';



COMMENT ON COLUMN "public"."orders"."delivery_status" IS 'Fulfilment state, e.g. awaiting dispatch, dispatched, delivered.';



COMMENT ON COLUMN "public"."orders"."delivery_address" IS 'delivery address';



COMMENT ON COLUMN "public"."orders"."subtotal" IS 'Cart items subtotal before delivery and promo discounts.';



COMMENT ON COLUMN "public"."orders"."delivery_fee" IS 'Delivery fee charged for the order after free-delivery threshold logic.';



COMMENT ON COLUMN "public"."orders"."item_discount" IS 'Discount amount applied to order items from a promo code.';



COMMENT ON COLUMN "public"."orders"."delivery_discount" IS 'Discount amount applied to delivery from a promo code.';



COMMENT ON COLUMN "public"."orders"."discount_total" IS 'Combined discount amount applied to the order.';



COMMENT ON COLUMN "public"."orders"."promo_code" IS 'Promo or voucher code applied during checkout.';



COMMENT ON COLUMN "public"."orders"."promo_description" IS 'Human-readable promo description captured at checkout time.';



COMMENT ON COLUMN "public"."orders"."fulfillment_type" IS 'How the order is fulfilled: delivery or pickup.';



COMMENT ON COLUMN "public"."orders"."pickup_location_id" IS 'When fulfillment_type = pickup, the chosen pickup location.';



COMMENT ON COLUMN "public"."orders"."cancellation_reason" IS 'Why the order was cancelled (set when status = cancelled).';



COMMENT ON COLUMN "public"."orders"."allow_substitutions" IS 'Customer consent to receive a substitute if an item is out of stock.';



COMMENT ON COLUMN "public"."orders"."delivery_instructions" IS 'Customer instructions for the rider, e.g. call at the gate.';



COMMENT ON COLUMN "public"."orders"."tax_amount" IS 'VAT/tax charged on the order (NGN).';



CREATE SEQUENCE IF NOT EXISTS "public"."orders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."orders_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."orders_id_seq" OWNED BY "public"."orders"."id";



CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "provider" "text",
    "last4" "text",
    "token" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_methods" IS 'Saved customer payment methods and tokens.';



CREATE SEQUENCE IF NOT EXISTS "public"."payment_methods_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."payment_methods_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."payment_methods_id_seq" OWNED BY "public"."payment_methods"."id";



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" integer NOT NULL,
    "order_id" integer,
    "amount" numeric(12,2) NOT NULL,
    "method" "text" DEFAULT 'cash'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "transaction_ref" "text",
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS 'Payment records against orders (amount, method, status, reference).';



COMMENT ON COLUMN "public"."payments"."method" IS 'Payment channel, e.g. cash, transfer, paystack, opay.';



COMMENT ON COLUMN "public"."payments"."status" IS 'Payment status, e.g. pending, success, failed.';



COMMENT ON COLUMN "public"."payments"."transaction_ref" IS 'Unique gateway/transaction reference.';



CREATE SEQUENCE IF NOT EXISTS "public"."payments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."payments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."payments_id_seq" OWNED BY "public"."payments"."id";



CREATE TABLE IF NOT EXISTS "public"."pickup_locations" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "city" "text" DEFAULT 'Ibadan'::"text" NOT NULL,
    "phone" "text",
    "hours" "text",
    "instructions" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL
);


ALTER TABLE "public"."pickup_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."pickup_locations" IS 'Physical locations where customers can collect orders (e.g. the Meal05 hub).';



ALTER TABLE "public"."pickup_locations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."pickup_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."product_attributes" (
    "id" integer NOT NULL,
    "product_id" integer NOT NULL,
    "attribute_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_attributes" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_attributes" IS 'Join table linking products to their attributes.';



COMMENT ON COLUMN "public"."product_attributes"."product_id" IS 'References products.id.';



CREATE SEQUENCE IF NOT EXISTS "public"."product_attributes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."product_attributes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."product_attributes_id_seq" OWNED BY "public"."product_attributes"."id";



CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_categories" IS 'Product groupings shown in storefront navigation (e.g. Vegetables, Peppers, Tubers).';



COMMENT ON COLUMN "public"."product_categories"."slug" IS 'URL-friendly identifier for the category.';



COMMENT ON COLUMN "public"."product_categories"."is_active" IS 'False = category exists but is not yet offered to customers (hidden from storefront).';



COMMENT ON COLUMN "public"."product_categories"."sort_order" IS 'Display order in storefront navigation.';



CREATE SEQUENCE IF NOT EXISTS "public"."product_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."product_categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."product_categories_id_seq" OWNED BY "public"."product_categories"."id";



CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "variant_id" bigint,
    "image_url" "text" NOT NULL,
    "alt_text" "text",
    "position" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_images" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_images" IS 'Image gallery for products and optionally specific variants. position controls display order.';



CREATE SEQUENCE IF NOT EXISTS "public"."product_images_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."product_images_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."product_images_id_seq" OWNED BY "public"."product_images"."id";



CREATE TABLE IF NOT EXISTS "public"."product_markets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" bigint NOT NULL,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    "local_name" "text",
    "is_listed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_markets" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_markets" IS 'Per-market product listings. Controls which catalog products appear in each market, with optional per-market local_name override. local_name falls back to products.local_name then products.name.';



CREATE TABLE IF NOT EXISTS "public"."product_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" bigint NOT NULL,
    "rating" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "review" "text",
    "is_approved" boolean DEFAULT true NOT NULL,
    CONSTRAINT "product_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."product_ratings" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_ratings" IS 'Customer star ratings (1 to 5) for products.';



COMMENT ON COLUMN "public"."product_ratings"."rating" IS 'Star rating from 1 to 5.';



COMMENT ON COLUMN "public"."product_ratings"."review" IS 'Optional written review accompanying the star rating.';



COMMENT ON COLUMN "public"."product_ratings"."is_approved" IS 'Moderation flag; false hides the review from the public.';



CREATE TABLE IF NOT EXISTS "public"."product_suppliers" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "supplier_id" bigint NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "last_cost" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_suppliers_last_cost_check" CHECK ((("last_cost" IS NULL) OR ("last_cost" >= (0)::numeric)))
);


ALTER TABLE "public"."product_suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_suppliers" IS 'Which suppliers supply which products, with last known cost price.';



COMMENT ON COLUMN "public"."product_suppliers"."is_primary" IS 'Marks the preferred/default supplier for a product.';



COMMENT ON COLUMN "public"."product_suppliers"."last_cost" IS 'Most recent purchase cost from this supplier (NGN), for margin tracking.';



ALTER TABLE "public"."product_suppliers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."product_suppliers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "old_price" numeric(12,2),
    "stock_count" integer DEFAULT 0 NOT NULL,
    "size" "text",
    "ripeness" "text",
    "base_unit" "text",
    "base_quantity" numeric(12,3),
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weight_raw" "text",
    "weight_min" numeric(12,3),
    "weight_max" numeric(12,3),
    "weight_unit" "text",
    "grade" "text",
    "volume_raw" "text",
    "volume_min" numeric(12,3),
    "volume_max" numeric(12,3),
    "volume_unit" "text",
    "form" "text",
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL,
    CONSTRAINT "product_variants_form_check" CHECK (("form" = ANY (ARRAY['fresh'::"text", 'processed'::"text", 'dried'::"text", 'smoked'::"text", 'powdered'::"text", 'liquid'::"text", 'whole'::"text", 'cut'::"text"]))),
    CONSTRAINT "product_variants_v2_base_quantity_check" CHECK ((("base_quantity" IS NULL) OR ("base_quantity" > (0)::numeric))),
    CONSTRAINT "product_variants_v2_grade_check" CHECK (("grade" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"]))),
    CONSTRAINT "product_variants_v2_old_price_check" CHECK ((("old_price" IS NULL) OR ("old_price" >= (0)::numeric))),
    CONSTRAINT "product_variants_v2_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "product_variants_v2_stock_count_check" CHECK (("stock_count" >= 0))
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_variants" IS 'Sellable variants of a product (e.g. different units, sizes, grades). Holds price and stock_count.';



COMMENT ON COLUMN "public"."product_variants"."unit" IS 'Customer-facing sales unit label, e.g. kg, paint, derica, mudu, piece.';



COMMENT ON COLUMN "public"."product_variants"."price" IS 'Selling price for this variant (NGN).';



COMMENT ON COLUMN "public"."product_variants"."old_price" IS 'Optional original/strike-through price for showing a discount.';



COMMENT ON COLUMN "public"."product_variants"."stock_count" IS 'Units currently in stock for this variant.';



COMMENT ON COLUMN "public"."product_variants"."ripeness" IS 'Ripeness state where relevant (e.g. ripe, unripe).';



COMMENT ON COLUMN "public"."product_variants"."base_unit" IS 'Canonical unit (e.g. kg, g, L) used to normalize and compare variants.';



COMMENT ON COLUMN "public"."product_variants"."base_quantity" IS 'Quantity in base_unit that this variant represents, for price-per-unit math.';



COMMENT ON COLUMN "public"."product_variants"."is_default" IS 'The variant pre-selected on the product page.';



COMMENT ON COLUMN "public"."product_variants"."is_active" IS 'When false, the variant is not sellable.';



COMMENT ON COLUMN "public"."product_variants"."grade" IS 'Quality grade: A, B, or C.';



COMMENT ON COLUMN "public"."product_variants"."form" IS 'Physical form: fresh, processed, dried, smoked, powdered, liquid, whole, or cut.';



ALTER TABLE "public"."product_variants" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."product_variants_v2_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sku" "text",
    "category_id" bigint,
    "main_image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "in_season" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "promo_tag_text" "text",
    "promo_tag_expires_at" timestamp with time zone,
    "promo_tag_enabled" boolean DEFAULT false NOT NULL,
    "sourcing_type" "text" DEFAULT 'staple'::"text" NOT NULL,
    "local_name" "text",
    "search_keywords" "text",
    CONSTRAINT "products_promo_tag_text_length_check" CHECK ((("promo_tag_text" IS NULL) OR (("char_length"("btrim"("promo_tag_text")) >= 1) AND ("char_length"("btrim"("promo_tag_text")) <= 80)))),
    CONSTRAINT "products_sourcing_type_check" CHECK (("sourcing_type" = ANY (ARRAY['fresh'::"text", 'staple'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON TABLE "public"."products" IS 'Master product catalog. One row per sellable produce item; pricing and stock live on product_variants.';



COMMENT ON COLUMN "public"."products"."sku" IS 'Unique stock-keeping code for the product.';



COMMENT ON COLUMN "public"."products"."category_id" IS 'References product_categories.id.';



COMMENT ON COLUMN "public"."products"."main_image_url" IS 'Primary storefront image for the product card.';



COMMENT ON COLUMN "public"."products"."is_active" IS 'When false, the product is hidden from the storefront.';



COMMENT ON COLUMN "public"."products"."in_season" IS 'Seasonal availability flag for farm-fresh produce.';



COMMENT ON COLUMN "public"."products"."promo_tag_text" IS 'Optional storefront promo ribbon label shown on product cards.';



COMMENT ON COLUMN "public"."products"."promo_tag_expires_at" IS 'Optional promo ribbon expiry. When passed, the storefront hides expired promo ribbons and can render a countdown.';



COMMENT ON COLUMN "public"."products"."promo_tag_enabled" IS 'Controls whether the storefront promo ribbon is visible for the product.';



COMMENT ON COLUMN "public"."products"."sourcing_type" IS 'fresh = perishable, shown only when on the day''s locked menu, sourced post-order; staple = always available from stock_ledger. Default staple preserves current behaviour.';



COMMENT ON COLUMN "public"."products"."local_name" IS 'Local/Yoruba name(s) for the item, e.g. efo, ata, to aid search.';



COMMENT ON COLUMN "public"."products"."search_keywords" IS 'Extra search terms/synonyms for discovery.';



CREATE OR REPLACE VIEW "public"."products_cards_view" WITH ("security_invoker"='on') AS
 SELECT "p"."id" AS "product_id",
    "p"."name" AS "product_name",
    "pc"."name" AS "category_name",
    "pc"."slug" AS "category_slug",
    "p"."main_image_url",
    "p"."is_active",
    "p"."in_season"
   FROM ("public"."products" "p"
     LEFT JOIN "public"."product_categories" "pc" ON (("pc"."id" = "p"."category_id")))
  WHERE ("p"."is_active" IS DISTINCT FROM false);


ALTER VIEW "public"."products_cards_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."products_cards_view_v2" AS
SELECT
    NULL::bigint AS "id",
    NULL::"text" AS "name",
    NULL::"text" AS "main_image_url",
    NULL::bigint AS "category_id",
    NULL::boolean AS "is_active",
    NULL::boolean AS "in_season",
    NULL::numeric AS "starting_price",
    NULL::boolean AS "in_stock";


ALTER VIEW "public"."products_cards_view_v2" OWNER TO "postgres";


ALTER TABLE "public"."products" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."products_v2_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "min_subtotal" numeric(12,2),
    "max_discount" numeric(12,2),
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "usage_limit" integer,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    CONSTRAINT "promo_codes_code_format_check" CHECK ((("code" = "upper"("btrim"("code"))) AND ("code" ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'::"text"))),
    CONSTRAINT "promo_codes_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text", 'delivery'::"text"]))),
    CONSTRAINT "promo_codes_discount_value_check" CHECK (((("discount_type" = 'percent'::"text") AND ("discount_value" > (0)::numeric) AND ("discount_value" <= (100)::numeric)) OR (("discount_type" = 'fixed'::"text") AND ("discount_value" > (0)::numeric)) OR (("discount_type" = 'delivery'::"text") AND ("discount_value" >= (0)::numeric)))),
    CONSTRAINT "promo_codes_max_discount_check" CHECK ((("max_discount" IS NULL) OR ("max_discount" >= (0)::numeric))),
    CONSTRAINT "promo_codes_min_subtotal_check" CHECK ((("min_subtotal" IS NULL) OR ("min_subtotal" >= (0)::numeric))),
    CONSTRAINT "promo_codes_usage_count_check" CHECK (("usage_count" >= 0)),
    CONSTRAINT "promo_codes_usage_limit_check" CHECK ((("usage_limit" IS NULL) OR ("usage_limit" > 0))),
    CONSTRAINT "promo_codes_valid_window_check" CHECK ((("expires_at" IS NULL) OR ("starts_at" IS NULL) OR ("expires_at" > "starts_at")))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";


COMMENT ON TABLE "public"."promo_codes" IS 'Database-backed promo and voucher codes that can be validated during cart and checkout flows.';



COMMENT ON COLUMN "public"."promo_codes"."code" IS 'Uppercase promo code entered by customers during cart or checkout.';



COMMENT ON COLUMN "public"."promo_codes"."discount_type" IS 'Allowed values: percent, fixed, delivery.';



COMMENT ON COLUMN "public"."promo_codes"."discount_value" IS 'Percent points for percent discounts, currency amount for fixed discounts, optional delivery cap for delivery discounts.';



COMMENT ON COLUMN "public"."promo_codes"."usage_limit" IS 'Maximum number of successful redemptions allowed for this code.';



ALTER TABLE "public"."promo_codes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."promo_codes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" bigint NOT NULL,
    "order_id" integer NOT NULL,
    "amount" numeric NOT NULL,
    "reason" "text",
    "method" "text" DEFAULT 'wallet'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL,
    CONSTRAINT "refunds_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "refunds_method_check" CHECK (("method" = ANY (ARRAY['wallet'::"text", 'original_payment'::"text", 'cash'::"text", 'bank_transfer'::"text"]))),
    CONSTRAINT "refunds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'processed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


COMMENT ON TABLE "public"."refunds" IS 'Refunds issued against orders: amount, reason, and how money was returned (wallet, original payment, cash).';



ALTER TABLE "public"."refunds" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."refunds_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stock_ledger" (
    "id" bigint NOT NULL,
    "variant_id" bigint NOT NULL,
    "change_qty" integer NOT NULL,
    "reason" "text" NOT NULL,
    "source" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."stock_ledger" IS 'Unified stock movement ledger: every change to variant stock (sales, restocks, adjustments). Replaces the 5 legacy stock/restock tables.';



COMMENT ON COLUMN "public"."stock_ledger"."change_qty" IS 'Signed quantity change: positive = stock in, negative = stock out.';



COMMENT ON COLUMN "public"."stock_ledger"."reason" IS 'Why the change happened, e.g. sale, restock, adjustment.';



COMMENT ON COLUMN "public"."stock_ledger"."source" IS 'Optional origin, e.g. order id, admin, system.';



CREATE OR REPLACE VIEW "public"."restock_log_v2" WITH ("security_invoker"='on') AS
 SELECT "id",
    "variant_id",
    "change_qty" AS "quantity",
    "source" AS "restocked_by",
    "created_at" AS "restocked_at"
   FROM "public"."stock_ledger"
  WHERE ("reason" = 'restock'::"text");


ALTER VIEW "public"."restock_log_v2" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rls_debug_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_name" "text" NOT NULL,
    "policy_name" "text" NOT NULL,
    "acting_role" "text" DEFAULT COALESCE(("auth"."jwt"() ->> 'role'::"text"), 'user'::"text") NOT NULL,
    "db_user" "text" DEFAULT CURRENT_USER NOT NULL,
    "auth_uid" "uuid" DEFAULT "auth"."uid"(),
    "allowed" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."rls_debug_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."rls_debug_log" IS 'Diagnostic log for Row Level Security checks. Housekeeping/dev only.';



CREATE SEQUENCE IF NOT EXISTS "public"."rls_debug_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rls_debug_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rls_debug_log_id_seq" OWNED BY "public"."rls_debug_log"."id";



CREATE TABLE IF NOT EXISTS "public"."schema_backups" (
    "id" bigint NOT NULL,
    "filename" "text" NOT NULL,
    "exported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."schema_backups" OWNER TO "postgres";


COMMENT ON TABLE "public"."schema_backups" IS 'Record of schema export/backup events. Housekeeping.';



CREATE SEQUENCE IF NOT EXISTS "public"."schema_backups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."schema_backups_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."schema_backups_id_seq" OWNED BY "public"."schema_backups"."id";



ALTER TABLE "public"."stock_ledger" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."stock_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "location" "text",
    "supplier_type" "text" DEFAULT 'farmer'::"text" NOT NULL,
    "produce_notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "market_id" "uuid" DEFAULT "public"."default_market_id"() NOT NULL,
    CONSTRAINT "suppliers_supplier_type_check" CHECK (("supplier_type" = ANY (ARRAY['farmer'::"text", 'market'::"text", 'wholesaler'::"text", 'processor'::"text"])))
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."suppliers" IS 'Farmers, markets, and wholesalers Meal05 sources produce from.';



COMMENT ON COLUMN "public"."suppliers"."location" IS 'Farm or market location (area/town).';



COMMENT ON COLUMN "public"."suppliers"."supplier_type" IS 'farmer, market, wholesaler, or processor.';



ALTER TABLE "public"."suppliers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."suppliers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_settings" IS 'Generic key/value store for app-wide settings.';



CREATE TABLE IF NOT EXISTS "public"."user_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text",
    "full_name" "text",
    "phone" "text",
    "line1" "text" NOT NULL,
    "line2" "text",
    "city" "text" NOT NULL,
    "state" "text",
    "country" "text" DEFAULT 'Nigeria'::"text" NOT NULL,
    "postal_code" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_addresses" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_addresses" IS 'Saved delivery addresses in a customer address book.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "phone" "text",
    "address" "text",
    "city" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auth_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "role" "text" DEFAULT 'customer'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "deleted_at" timestamp with time zone,
    "first_name" "text",
    "last_name" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Customer and staff accounts, linked 1:1 to auth.users. The role column drives access.';



COMMENT ON COLUMN "public"."users"."role" IS 'Access role: customer, admin, warehouse, or driver. Single source of truth.';



COMMENT ON COLUMN "public"."users"."is_active" IS 'When false, the account is disabled.';



COMMENT ON COLUMN "public"."users"."deleted_at" IS 'Soft-delete timestamp; non-null means hidden.';



CREATE OR REPLACE VIEW "public"."vw_catalog_overview" WITH ("security_invoker"='on') AS
 SELECT "p"."id" AS "product_id",
    "p"."name" AS "product",
    "c"."name" AS "category",
    "p"."is_active",
    "p"."in_season",
    "count"("v"."id") AS "variant_count",
    "count"("v"."id") FILTER (WHERE "v"."is_active") AS "active_variants",
    "min"("v"."price") FILTER (WHERE "v"."is_active") AS "from_price",
    "max"("v"."price") FILTER (WHERE "v"."is_active") AS "to_price",
    COALESCE("sum"("v"."stock_count") FILTER (WHERE "v"."is_active"), (0)::bigint) AS "total_stock",
    "p"."created_at"
   FROM (("public"."products" "p"
     LEFT JOIN "public"."product_categories" "c" ON (("c"."id" = "p"."category_id")))
     LEFT JOIN "public"."product_variants" "v" ON (("v"."product_id" = "p"."id")))
  GROUP BY "p"."id", "p"."name", "c"."name", "p"."is_active", "p"."in_season", "p"."created_at"
  ORDER BY "c"."name", "p"."name";


ALTER VIEW "public"."vw_catalog_overview" OWNER TO "postgres";


COMMENT ON VIEW "public"."vw_catalog_overview" IS 'Business view: one row per product with category, active-variant count, price range, and total stock. Read-only summary for staff.';



CREATE OR REPLACE VIEW "public"."vw_daily_sales_summary" WITH ("security_invoker"='on') AS
 SELECT "date_trunc"('day'::"text", "created_at") AS "day",
    "count"(DISTINCT "id") AS "order_count",
    "sum"("total") AS "total_revenue",
    "avg"("total") AS "avg_order_value"
   FROM "public"."orders" "o"
  WHERE ("status" = ANY (ARRAY['paid'::"text", 'completed'::"text"]))
  GROUP BY ("date_trunc"('day'::"text", "created_at"))
  ORDER BY ("date_trunc"('day'::"text", "created_at")) DESC;


ALTER VIEW "public"."vw_daily_sales_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_delivery_queue" WITH ("security_invoker"='on') AS
 SELECT "o"."order_reference",
    "u"."name" AS "customer",
    "u"."phone",
    COALESCE("o"."delivery_address", "u"."address") AS "address",
    "o"."total",
    "o"."payment_verified",
    "o"."delivery_status",
    "o"."created_at"
   FROM ("public"."orders" "o"
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "o"."user_id")))
  WHERE ("o"."delivery_status" <> 'delivered'::"text")
  ORDER BY "o"."created_at";


ALTER VIEW "public"."vw_delivery_queue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_delivery_summary" WITH ("security_invoker"='on') AS
 SELECT "d"."id" AS "delivery_id",
    "o"."id" AS "order_id",
    "o"."order_reference",
    "o"."status" AS "order_status",
    "u"."name" AS "customer_name",
    "u"."phone" AS "customer_phone",
    COALESCE("o"."delivery_address", "u"."address") AS "delivery_address",
    "p"."status" AS "payment_status",
    "p"."method" AS "payment_method",
    "a"."full_name" AS "driver_name",
    "a"."phone" AS "driver_phone",
    "d"."status" AS "delivery_status",
    "d"."created_at" AS "created_on",
    "d"."updated_at" AS "last_update",
    "d"."delivered_at",
    "o"."total"
   FROM (((("public"."deliveries" "d"
     JOIN "public"."orders" "o" ON (("d"."order_id" = "o"."id")))
     LEFT JOIN "public"."users" "u" ON (("o"."user_id" = "u"."id")))
     LEFT JOIN "public"."payments" "p" ON (("p"."order_id" = "o"."id")))
     LEFT JOIN "public"."delivery_agents" "a" ON (("a"."id" = "d"."agent_id")))
  ORDER BY "d"."created_at" DESC;


ALTER VIEW "public"."vw_delivery_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_low_stock" WITH ("security_invoker"='on') AS
 SELECT "v"."id" AS "variant_id",
    "p"."name" AS "product",
    "v"."name" AS "variant",
    "v"."unit",
    "v"."stock_count",
    "v"."price",
    "c"."name" AS "category"
   FROM (("public"."product_variants" "v"
     JOIN "public"."products" "p" ON (("p"."id" = "v"."product_id")))
     LEFT JOIN "public"."product_categories" "c" ON (("c"."id" = "p"."category_id")))
  WHERE ("v"."is_active" AND ("v"."stock_count" <= 5))
  ORDER BY "v"."stock_count", "p"."name";


ALTER VIEW "public"."vw_low_stock" OWNER TO "postgres";


COMMENT ON VIEW "public"."vw_low_stock" IS 'Business view: active variants at or below 5 units in stock — a restock worklist. Threshold can be adjusted.';



CREATE OR REPLACE VIEW "public"."vw_orders_without_user" WITH ("security_invoker"='on') AS
 SELECT "o"."id",
    "o"."user_id",
    "o"."total",
    "o"."status",
    "o"."created_at",
    "o"."payment_method",
    "o"."updated_at",
    "o"."order_reference",
    "o"."payment_status",
    "o"."payment_reference",
    "o"."payment_verified",
    "o"."delivery_status",
    "o"."delivery_date",
    "o"."deleted_at"
   FROM ("public"."orders" "o"
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "o"."user_id")))
  WHERE ("u"."id" IS NULL);


ALTER VIEW "public"."vw_orders_without_user" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_rls_activity" WITH ("security_invoker"='on') AS
 SELECT "id",
    "at" AS "timestamp",
    "auth_uid" AS "user_id",
    "acting_role" AS "role",
    "db_user",
    "table_name",
    "policy_name",
    "allowed"
   FROM "public"."rls_debug_log"
  ORDER BY "id" DESC;


ALTER VIEW "public"."vw_rls_activity" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sales_summary" WITH ("security_invoker"='on') AS
 SELECT "date"("o"."created_at") AS "order_date",
    "count"(DISTINCT "o"."id") AS "total_orders",
    "sum"("oi"."quantity") AS "total_items_sold",
    "sum"(("oi"."price" * ("oi"."quantity")::numeric)) AS "total_revenue"
   FROM ("public"."orders" "o"
     JOIN "public"."order_items" "oi" ON (("o"."id" = "oi"."order_id")))
  WHERE ("o"."status" <> 'cancelled'::"text")
  GROUP BY ("date"("o"."created_at"))
  ORDER BY ("date"("o"."created_at")) DESC;


ALTER VIEW "public"."vw_sales_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sales_summary_monthly" WITH ("security_invoker"='on') AS
 SELECT "to_char"("created_at", 'YYYY-MM'::"text") AS "month",
    "count"("id") AS "total_orders",
    "sum"("total") AS "total_value",
    "sum"(
        CASE
            WHEN ("status" = ANY (ARRAY['paid'::"text", 'completed'::"text"])) THEN "total"
            ELSE (0)::numeric
        END) AS "revenue",
    "count"(DISTINCT "user_id") AS "unique_customers"
   FROM "public"."orders" "o"
  GROUP BY ("to_char"("created_at", 'YYYY-MM'::"text"))
  ORDER BY ("to_char"("created_at", 'YYYY-MM'::"text")) DESC;


ALTER VIEW "public"."vw_sales_summary_monthly" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sourcing" WITH ("security_invoker"='on') AS
 SELECT "p"."id" AS "product_id",
    "p"."name" AS "product",
    "p"."sourcing_type",
    "s"."name" AS "primary_supplier",
    "s"."phone" AS "supplier_phone",
    "ps"."last_cost",
    "dv"."price" AS "default_price",
        CASE
            WHEN (("ps"."last_cost" IS NOT NULL) AND ("ps"."last_cost" > (0)::numeric) AND ("dv"."price" IS NOT NULL)) THEN "round"(((("dv"."price" - "ps"."last_cost") / "dv"."price") * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS "gross_margin_pct"
   FROM ((("public"."products" "p"
     LEFT JOIN "public"."product_suppliers" "ps" ON ((("ps"."product_id" = "p"."id") AND "ps"."is_primary")))
     LEFT JOIN "public"."suppliers" "s" ON (("s"."id" = "ps"."supplier_id")))
     LEFT JOIN LATERAL ( SELECT "v"."price"
           FROM "public"."product_variants" "v"
          WHERE (("v"."product_id" = "p"."id") AND "v"."is_default")
          ORDER BY "v"."id"
         LIMIT 1) "dv" ON (true));


ALTER VIEW "public"."vw_sourcing" OWNER TO "postgres";


COMMENT ON VIEW "public"."vw_sourcing" IS 'Each product with its primary supplier, last cost, default price, and gross margin percent. Populates as suppliers are linked.';



CREATE OR REPLACE VIEW "public"."vw_todays_menu" WITH ("security_invoker"='on') AS
 SELECT "dm"."menu_date",
    "dm"."status" AS "menu_status",
    "p"."id" AS "product_id",
    "p"."name" AS "product",
    "c"."name" AS "category",
    "v"."id" AS "variant_id",
    "v"."name" AS "variant",
    "v"."unit",
    COALESCE("i"."price_today", "v"."price") AS "effective_price",
    "i"."price_today",
    "v"."price" AS "base_price",
    "i"."cap_qty",
    "i"."sold_qty",
        CASE
            WHEN ("i"."cap_qty" IS NULL) THEN NULL::integer
            ELSE GREATEST(("i"."cap_qty" - "i"."sold_qty"), 0)
        END AS "remaining_today"
   FROM (((("public"."daily_menus" "dm"
     JOIN "public"."daily_menu_items" "i" ON (("i"."daily_menu_id" = "dm"."id")))
     JOIN "public"."product_variants" "v" ON (("v"."id" = "i"."variant_id")))
     JOIN "public"."products" "p" ON (("p"."id" = "v"."product_id")))
     LEFT JOIN "public"."product_categories" "c" ON (("c"."id" = "p"."category_id")))
  WHERE (("dm"."menu_date" = (("now"() AT TIME ZONE 'Africa/Lagos'::"text"))::"date") AND "i"."is_available");


ALTER VIEW "public"."vw_todays_menu" OWNER TO "postgres";


COMMENT ON VIEW "public"."vw_todays_menu" IS 'Today''s live fresh menu (Africa/Lagos date): available items with effective price and remaining quantity.';



CREATE OR REPLACE VIEW "public"."vw_top_customers" WITH ("security_invoker"='on') AS
 SELECT "u"."id" AS "customer_id",
    "u"."name" AS "customer_name",
    "u"."email",
    "u"."phone",
    "count"("o"."id") AS "total_orders",
    "sum"("o"."total") AS "total_spent",
    "avg"("o"."total") AS "avg_order_value",
    "max"("o"."created_at") AS "last_order_date"
   FROM ("public"."users" "u"
     JOIN "public"."orders" "o" ON (("o"."user_id" = "u"."id")))
  WHERE ("o"."status" = ANY (ARRAY['paid'::"text", 'completed'::"text"]))
  GROUP BY "u"."id", "u"."name", "u"."email", "u"."phone"
  ORDER BY ("sum"("o"."total")) DESC, ("count"("o"."id")) DESC;


ALTER VIEW "public"."vw_top_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "order_id" integer,
    "refund_id" bigint,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency_code" "text" DEFAULT 'NGN'::"text" NOT NULL,
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['credit'::"text", 'debit'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_transactions" IS 'Customer wallet / store-credit ledger. Positive amount = credit, negative = debit; balance = sum per user.';



CREATE OR REPLACE VIEW "public"."vw_wallet_balances" WITH ("security_invoker"='on') AS
 SELECT "user_id",
    COALESCE("sum"("amount"), (0)::numeric) AS "balance",
    "max"("created_at") AS "last_activity"
   FROM "public"."wallet_transactions"
  GROUP BY "user_id";


ALTER VIEW "public"."vw_wallet_balances" OWNER TO "postgres";


COMMENT ON VIEW "public"."vw_wallet_balances" IS 'Current wallet/store-credit balance per customer (sum of wallet_transactions).';



CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "country" "text" DEFAULT 'NG'::"text" NOT NULL,
    "city" "text",
    "source" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "consent_at" timestamp with time zone,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "unsubscribed_at" timestamp with time zone,
    CONSTRAINT "waitlist_contact_present" CHECK ((("email" IS NOT NULL) OR ("phone" IS NOT NULL))),
    CONSTRAINT "waitlist_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'contacted'::"text", 'converted'::"text", 'unsubscribed'::"text"])))
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


COMMENT ON TABLE "public"."waitlist" IS 'Pre-launch / early-access signups captured from the landing page. Public can insert; only admins can read or manage.';



ALTER TABLE "public"."wallet_transactions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."wallet_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."wishlists" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "product_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wishlists" OWNER TO "postgres";


COMMENT ON TABLE "public"."wishlists" IS 'Products a user has saved to a wishlist.';



CREATE SEQUENCE IF NOT EXISTS "public"."wishlists_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wishlists_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wishlists_id_seq" OWNED BY "public"."wishlists"."id";



ALTER TABLE ONLY "public"."attribute_options" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attribute_options_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."attribute_price_modifiers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attribute_price_modifiers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."attributes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attributes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."auth_admin_queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_admin_queue_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cart_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cart_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."deliveries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deliveries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."delivery_agents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."delivery_agents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."order_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."order_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."orders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."orders_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."payment_methods" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_methods_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."payments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."product_attributes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."product_attributes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."product_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."product_categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."product_images" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."product_images_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rls_debug_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rls_debug_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."schema_backups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."schema_backups_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wishlists" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wishlists_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attribute_options"
    ADD CONSTRAINT "attribute_options_attribute_id_value_key" UNIQUE ("attribute_id", "value");



ALTER TABLE ONLY "public"."attribute_options"
    ADD CONSTRAINT "attribute_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attribute_options"
    ADD CONSTRAINT "attribute_options_unique_attribute_value" UNIQUE ("attribute_id", "value");



ALTER TABLE ONLY "public"."attribute_price_modifiers"
    ADD CONSTRAINT "attribute_price_modifiers_attribute_option_id_key" UNIQUE ("attribute_option_id");



ALTER TABLE ONLY "public"."attribute_price_modifiers"
    ADD CONSTRAINT "attribute_price_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attributes"
    ADD CONSTRAINT "attributes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."attributes"
    ADD CONSTRAINT "attributes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_admin_queue"
    ADD CONSTRAINT "auth_admin_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banner_urls"
    ADD CONSTRAINT "banner_urls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_menu_items"
    ADD CONSTRAINT "daily_menu_items_daily_menu_id_variant_id_key" UNIQUE ("daily_menu_id", "variant_id");



ALTER TABLE ONLY "public"."daily_menu_items"
    ADD CONSTRAINT "daily_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_menu_date_key" UNIQUE ("menu_date");



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_agents"
    ADD CONSTRAINT "delivery_agents_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."delivery_agents"
    ADD CONSTRAINT "delivery_agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_settings"
    ADD CONSTRAINT "delivery_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."markets"
    ADD CONSTRAINT "markets_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."markets"
    ADD CONSTRAINT "markets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_reference_key" UNIQUE ("order_reference");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_transaction_ref_key" UNIQUE ("transaction_ref");



ALTER TABLE ONLY "public"."pickup_locations"
    ADD CONSTRAINT "pickup_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_product_id_attribute_id_key" UNIQUE ("product_id", "attribute_id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_markets"
    ADD CONSTRAINT "product_markets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_markets"
    ADD CONSTRAINT "product_markets_product_id_market_id_key" UNIQUE ("product_id", "market_id");



ALTER TABLE ONLY "public"."product_ratings"
    ADD CONSTRAINT "product_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_ratings"
    ADD CONSTRAINT "product_ratings_user_id_product_id_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_product_id_supplier_id_key" UNIQUE ("product_id", "supplier_id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_v2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_v2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_v2_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rls_debug_log"
    ADD CONSTRAINT "rls_debug_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schema_backups"
    ADD CONSTRAINT "schema_backups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_ledger"
    ADD CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_product_id_key" UNIQUE ("user_id", "product_id");



CREATE INDEX "admin_logs_type_created_at_idx" ON "public"."admin_logs" USING "btree" ("type", "created_at" DESC);



CREATE INDEX "daily_menus_market_id_idx" ON "public"."daily_menus" USING "btree" ("market_id");



CREATE INDEX "deliveries_market_id_idx" ON "public"."deliveries" USING "btree" ("market_id");



CREATE INDEX "delivery_agents_market_id_idx" ON "public"."delivery_agents" USING "btree" ("market_id");



CREATE INDEX "delivery_zones_market_id_idx" ON "public"."delivery_zones" USING "btree" ("market_id");



CREATE INDEX "idx_banner_urls_placement_schedule" ON "public"."banner_urls" USING "btree" ("placement", "is_active", "sort_order", "starts_at", "expires_at");



CREATE INDEX "idx_banner_urls_schedule" ON "public"."banner_urls" USING "btree" ("is_active", "sort_order", "starts_at", "expires_at");



CREATE INDEX "idx_daily_menu_items_menu" ON "public"."daily_menu_items" USING "btree" ("daily_menu_id");



CREATE INDEX "idx_daily_menu_items_variant" ON "public"."daily_menu_items" USING "btree" ("variant_id");



CREATE INDEX "idx_notifications_order" ON "public"."notifications" USING "btree" ("order_id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_order_items_product" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "idx_order_status_history_order" ON "public"."order_status_history" USING "btree" ("order_id");



CREATE INDEX "idx_orders_date" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_promo_code" ON "public"."orders" USING "btree" ("promo_code") WHERE ("promo_code" IS NOT NULL);



CREATE INDEX "idx_product_images_product" ON "public"."product_images" USING "btree" ("product_id");



CREATE INDEX "idx_product_images_variant" ON "public"."product_images" USING "btree" ("variant_id");



CREATE INDEX "idx_product_ratings_product_id" ON "public"."product_ratings" USING "btree" ("product_id");



CREATE INDEX "idx_product_ratings_user_id" ON "public"."product_ratings" USING "btree" ("user_id");



CREATE INDEX "idx_product_suppliers_product" ON "public"."product_suppliers" USING "btree" ("product_id");



CREATE INDEX "idx_product_suppliers_supplier" ON "public"."product_suppliers" USING "btree" ("supplier_id");



CREATE INDEX "idx_products_promo_tag_enabled" ON "public"."products" USING "btree" ("promo_tag_enabled") WHERE ("promo_tag_enabled" = true);



CREATE INDEX "idx_products_promo_tag_expires_at" ON "public"."products" USING "btree" ("promo_tag_expires_at") WHERE ("promo_tag_expires_at" IS NOT NULL);



CREATE INDEX "idx_promo_codes_active_window" ON "public"."promo_codes" USING "btree" ("is_active", "starts_at", "expires_at");



CREATE UNIQUE INDEX "idx_promo_codes_code" ON "public"."promo_codes" USING "btree" ("code");



CREATE INDEX "idx_refunds_order" ON "public"."refunds" USING "btree" ("order_id");



CREATE INDEX "idx_stock_ledger_variant" ON "public"."stock_ledger" USING "btree" ("variant_id");



CREATE INDEX "idx_wallet_tx_user" ON "public"."wallet_transactions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "markets_single_default" ON "public"."markets" USING "btree" ("is_default") WHERE "is_default";



CREATE INDEX "orders_market_id_idx" ON "public"."orders" USING "btree" ("market_id");



CREATE UNIQUE INDEX "orders_payment_reference_key" ON "public"."orders" USING "btree" ("payment_reference") WHERE ("payment_reference" IS NOT NULL);



CREATE INDEX "pickup_locations_market_id_idx" ON "public"."pickup_locations" USING "btree" ("market_id");



CREATE INDEX "product_markets_market_listed_idx" ON "public"."product_markets" USING "btree" ("market_id", "is_listed");



CREATE UNIQUE INDEX "product_one_default_variant" ON "public"."product_variants" USING "btree" ("product_id") WHERE ("is_default" = true);



CREATE INDEX "product_variants_market_id_idx" ON "public"."product_variants" USING "btree" ("market_id");



CREATE INDEX "promo_codes_market_id_idx" ON "public"."promo_codes" USING "btree" ("market_id");



CREATE INDEX "suppliers_market_id_idx" ON "public"."suppliers" USING "btree" ("market_id");



CREATE UNIQUE INDEX "user_addresses_one_default_per_user" ON "public"."user_addresses" USING "btree" ("user_id") WHERE "is_default";



CREATE INDEX "user_addresses_user_id_idx" ON "public"."user_addresses" USING "btree" ("user_id");



CREATE INDEX "waitlist_created_at_idx" ON "public"."waitlist" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "waitlist_email_unique" ON "public"."waitlist" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "waitlist_phone_unique" ON "public"."waitlist" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "waitlist_status_idx" ON "public"."waitlist" USING "btree" ("status");



CREATE OR REPLACE VIEW "public"."products_cards_view_v2" WITH ("security_invoker"='on') AS
 SELECT "p"."id",
    "p"."name",
    "p"."main_image_url",
    "p"."category_id",
    "p"."is_active",
    "p"."in_season",
    "min"("v"."price") FILTER (WHERE ("v"."is_active" = true)) AS "starting_price",
    "bool_or"((("v"."stock_count" > 0) AND ("v"."is_active" = true))) AS "in_stock"
   FROM ("public"."products" "p"
     LEFT JOIN "public"."product_variants" "v" ON (("v"."product_id" = "p"."id")))
  GROUP BY "p"."id";



CREATE OR REPLACE TRIGGER "decrease_product_stock_trigger" AFTER INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."decrease_product_stock"();



CREATE OR REPLACE TRIGGER "order_status_guard" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."validate_order_status_transition"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_complete_order_on_delivery" AFTER UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."complete_order_on_delivery"();



CREATE OR REPLACE TRIGGER "trg_create_delivery_after_payment" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."create_delivery_after_payment"();



CREATE OR REPLACE TRIGGER "trg_daily_menu_lock" BEFORE UPDATE ON "public"."daily_menus" FOR EACH ROW EXECUTE FUNCTION "public"."set_daily_menu_locked_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_after_payment" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."create_delivery_after_payment"();



CREATE OR REPLACE TRIGGER "trg_generate_order_reference" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_order_reference"();



CREATE OR REPLACE TRIGGER "trg_order_paid_after_payment" AFTER UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."mark_order_paid_after_payment"();



CREATE OR REPLACE TRIGGER "trg_refresh_delivery_updated_at" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_delivery_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_delivered_at_timestamp" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_delivered_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_set_delivery_in_transit_on_assignment" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_delivery_in_transit_on_assignment"();



CREATE OR REPLACE TRIGGER "trg_touch_orders" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_users" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_order_after_delivery" AFTER UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."update_order_after_delivery"();



CREATE OR REPLACE TRIGGER "trg_update_order_status_after_payment" AFTER INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_order_status_after_payment"();



ALTER TABLE ONLY "public"."attribute_options"
    ADD CONSTRAINT "attribute_options_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attribute_price_modifiers"
    ADD CONSTRAINT "attribute_price_modifiers_attribute_option_id_fkey" FOREIGN KEY ("attribute_option_id") REFERENCES "public"."attribute_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_menu_items"
    ADD CONSTRAINT "daily_menu_items_daily_menu_id_fkey" FOREIGN KEY ("daily_menu_id") REFERENCES "public"."daily_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_menu_items"
    ADD CONSTRAINT "daily_menu_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_menus"
    ADD CONSTRAINT "daily_menus_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."delivery_agents"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_agents"
    ADD CONSTRAINT "delivery_agents_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_substituted_variant_id_fkey" FOREIGN KEY ("substituted_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_locations"
    ADD CONSTRAINT "pickup_locations_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_markets"
    ADD CONSTRAINT "product_markets_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."product_markets"
    ADD CONSTRAINT "product_markets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ratings"
    ADD CONSTRAINT "product_ratings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ratings"
    ADD CONSTRAINT "product_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_v2_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_v2_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_ledger"
    ADD CONSTRAINT "stock_ledger_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id");



ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can view and manage all orders" ON "public"."orders" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view and update all users" ON "public"."users" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



CREATE POLICY "Enable read access for all users" ON "public"."cart_items" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."product_categories" FOR SELECT USING (true);



CREATE POLICY "Staff can update delivery status" ON "public"."deliveries" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));



CREATE POLICY "Users can insert their own orders" ON "public"."orders" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage own payment methods" ON "public"."payment_methods" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own wishlists" ON "public"."wishlists" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own record" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view order items of their own orders" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own deliveries" ON "public"."deliveries" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own orders" ON "public"."orders" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own payments" ON "public"."payments" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own record" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."admin_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_logs_admin_all" ON "public"."admin_logs" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."attribute_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attribute_options_admin_all" ON "public"."attribute_options" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "attribute_options_public_read" ON "public"."attribute_options" FOR SELECT USING (true);



ALTER TABLE "public"."attribute_price_modifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attribute_price_modifiers_admin_all" ON "public"."attribute_price_modifiers" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "attribute_price_modifiers_public_read" ON "public"."attribute_price_modifiers" FOR SELECT USING (true);



ALTER TABLE "public"."attributes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attributes_admin_all" ON "public"."attributes" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "attributes_public_read" ON "public"."attributes" FOR SELECT USING (true);



ALTER TABLE "public"."auth_admin_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_admin_queue_admin_all" ON "public"."auth_admin_queue" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."banner_urls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "banner_urls_select_active_anon" ON "public"."banner_urls" FOR SELECT TO "anon" USING (("is_active" = true));



CREATE POLICY "banner_urls_select_active_authenticated" ON "public"."banner_urls" FOR SELECT TO "authenticated" USING (("is_active" = true));



ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_menu_items_admin_all" ON "public"."daily_menu_items" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "daily_menu_items_public_read" ON "public"."daily_menu_items" FOR SELECT USING (true);



ALTER TABLE "public"."daily_menus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_menus_admin_all" ON "public"."daily_menus" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "daily_menus_public_read" ON "public"."daily_menus" FOR SELECT USING (true);



CREATE POLICY "delete own addresses" ON "public"."user_addresses" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_agents_admin_all" ON "public"."delivery_agents" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."delivery_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_settings_admin_all" ON "public"."delivery_settings" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "delivery_settings_public_read" ON "public"."delivery_settings" FOR SELECT USING (true);



ALTER TABLE "public"."delivery_zones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_zones_admin_all" ON "public"."delivery_zones" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "delivery_zones_public_read" ON "public"."delivery_zones" FOR SELECT USING (true);



CREATE POLICY "insert own addresses" ON "public"."user_addresses" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."markets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "markets_admin_all" ON "public"."markets" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "markets_public_read" ON "public"."markets" FOR SELECT USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_all" ON "public"."notifications" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_user"()));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_access" ON "public"."order_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND (("o"."user_id" = "auth"."uid"()) OR "public"."is_staff"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND (("o"."user_id" = "auth"."uid"()) OR "public"."is_staff"())))));



ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_user_access" ON "public"."orders" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_staff"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_staff"()));



CREATE POLICY "osh_admin_all" ON "public"."order_status_history" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "osh_select_own" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_status_history"."order_id") AND ("o"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."is_admin_user"()));



ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_user_access" ON "public"."payments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "payments"."order_id") AND (("o"."user_id" = "auth"."uid"()) OR "public"."is_staff"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "payments"."order_id") AND (("o"."user_id" = "auth"."uid"()) OR "public"."is_staff"())))));



ALTER TABLE "public"."pickup_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pickup_locations_admin_all" ON "public"."pickup_locations" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "pickup_locations_public_read" ON "public"."pickup_locations" FOR SELECT USING (true);



ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_attributes_admin_all" ON "public"."product_attributes" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "product_attributes_public_read" ON "public"."product_attributes" FOR SELECT USING (true);



ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_categories_admin_all" ON "public"."product_categories" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_images_admin_all" ON "public"."product_images" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "product_images_public_read" ON "public"."product_images" FOR SELECT USING (true);



ALTER TABLE "public"."product_markets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_markets_admin_all" ON "public"."product_markets" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "product_markets_public_read" ON "public"."product_markets" FOR SELECT USING (true);



ALTER TABLE "public"."product_ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_ratings_owner_delete" ON "public"."product_ratings" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_user"()));



CREATE POLICY "product_ratings_owner_insert" ON "public"."product_ratings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "product_ratings_owner_update" ON "public"."product_ratings" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_user"())) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_user"()));



CREATE POLICY "product_ratings_public_read" ON "public"."product_ratings" FOR SELECT USING ((("is_approved" = true) OR "public"."is_admin_user"()));



ALTER TABLE "public"."product_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_suppliers_admin_all" ON "public"."product_suppliers" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_variants_admin_all" ON "public"."product_variants" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "product_variants_public_read" ON "public"."product_variants" FOR SELECT USING (true);



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_admin_all" ON "public"."products" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "products_public_read" ON "public"."products" FOR SELECT USING (true);



ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promo_codes_admin_all" ON "public"."promo_codes" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "promo_codes_public_read" ON "public"."promo_codes" FOR SELECT USING ((("is_active" = true) OR "public"."is_admin_user"()));



CREATE POLICY "read own addresses" ON "public"."user_addresses" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refunds_admin_all" ON "public"."refunds" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "refunds_select_own" ON "public"."refunds" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "refunds"."order_id") AND ("o"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."is_admin_user"()));



ALTER TABLE "public"."rls_debug_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rls_debug_log_admin_all" ON "public"."rls_debug_log" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."schema_backups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schema_backups_admin_all" ON "public"."schema_backups" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."stock_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_ledger_admin_all" ON "public"."stock_ledger" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_admin_all" ON "public"."suppliers" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_settings_admin_all" ON "public"."system_settings" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "update own addresses" ON "public"."user_addresses" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_self_read" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users_self_update" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waitlist_admin_all" ON "public"."waitlist" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "waitlist_public_insert" ON "public"."waitlist" FOR INSERT WITH CHECK (true);



CREATE POLICY "wallet_admin_all" ON "public"."wallet_transactions" TO "authenticated" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "wallet_select_own" ON "public"."wallet_transactions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_user"()));



ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_movement_v2"("variant_id_input" bigint, "change_qty_input" integer, "reason_input" "text", "source_input" "text", "note_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_movement_v2"("variant_id_input" bigint, "change_qty_input" integer, "reason_input" "text", "source_input" "text", "note_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_movement_v2"("variant_id_input" bigint, "change_qty_input" integer, "reason_input" "text", "source_input" "text", "note_input" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_role"("auth_id" "uuid", "new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_role"("auth_id" "uuid", "new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkout_user_cart"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_user_cart"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_order_on_delivery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_order_on_delivery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_delivery_after_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_delivery_after_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."deactivate_user"("auth_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_user"("auth_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrease_product_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrease_product_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrease_product_stock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrease_product_stock"("p_order_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrease_product_stock"("p_order_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."decrease_product_stock"("p_order_id" integer, "p_reason" "text", "p_deducted_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrease_product_stock"("p_order_id" integer, "p_reason" "text", "p_deducted_by" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deduct_stock_for_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deduct_stock_for_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."default_market_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."default_market_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."default_market_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_variants_for_product"("p_product_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_variants_for_product"("p_product_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_variants_for_product"("p_product_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_deleted_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_deleted_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_updated_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_updated_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_manual_restock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_manual_restock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_restock_on_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_restock_on_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_schema_backup"("file_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_schema_backup"("file_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_schema_backup"("file_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_stock_deduction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_stock_deduction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_order_paid_after_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_order_paid_after_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_paystack_order_paid"("p_order_id" integer, "p_transaction_ref" "text", "p_amount" numeric, "p_currency_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_paystack_order_paid"("p_order_id" integer, "p_transaction_ref" "text", "p_amount" numeric, "p_currency_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_daily_category_performance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_daily_category_performance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_delivery_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_delivery_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_user_password"("auth_id" "uuid", "new_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_user_password"("auth_id" "uuid", "new_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer, "p_restocked_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_product"("p_product_id" integer, "p_quantity" integer, "p_restocked_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_daily_menu_locked_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_daily_menu_locked_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_daily_menu_locked_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_delivered_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_delivered_at_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_delivery_in_transit_on_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_delivery_in_transit_on_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_rls"("uid" "uuid", "target_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_rls"("uid" "uuid", "target_table" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_order_after_delivery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_after_delivery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_order_status_after_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status_after_payment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_product_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_order_status_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_order_status_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_order_status_transition"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attribute_options" TO "anon";
GRANT ALL ON TABLE "public"."attribute_options" TO "authenticated";
GRANT ALL ON TABLE "public"."attribute_options" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attribute_options_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attribute_options_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attribute_options_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attribute_price_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."attribute_price_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."attribute_price_modifiers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attribute_price_modifiers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attribute_price_modifiers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attribute_price_modifiers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attributes" TO "anon";
GRANT ALL ON TABLE "public"."attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."attributes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attributes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attributes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attributes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."auth_admin_queue" TO "anon";
GRANT ALL ON TABLE "public"."auth_admin_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_admin_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_admin_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_admin_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_admin_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."banner_urls" TO "anon";
GRANT ALL ON TABLE "public"."banner_urls" TO "authenticated";
GRANT ALL ON TABLE "public"."banner_urls" TO "service_role";



GRANT ALL ON SEQUENCE "public"."banner_urls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."banner_urls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."banner_urls_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cart_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cart_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cart_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."daily_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_menu_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_menu_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_menu_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_menu_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_menus" TO "anon";
GRANT ALL ON TABLE "public"."daily_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_menus" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_menus_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_menus_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_menus_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deliveries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deliveries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deliveries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_agents" TO "anon";
GRANT ALL ON TABLE "public"."delivery_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_agents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."delivery_agents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."delivery_agents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."delivery_agents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_settings" TO "anon";
GRANT ALL ON TABLE "public"."delivery_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_settings" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_zones" TO "anon";
GRANT ALL ON TABLE "public"."delivery_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_zones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."delivery_zones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."delivery_zones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."delivery_zones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."markets" TO "anon";
GRANT ALL ON TABLE "public"."markets" TO "authenticated";
GRANT ALL ON TABLE "public"."markets" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_status_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_status_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_status_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payment_methods_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payment_methods_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payment_methods_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pickup_locations" TO "anon";
GRANT ALL ON TABLE "public"."pickup_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."pickup_locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pickup_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pickup_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pickup_locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_attributes" TO "anon";
GRANT ALL ON TABLE "public"."product_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attributes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_attributes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_attributes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_attributes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_categories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_images" TO "anon";
GRANT ALL ON TABLE "public"."product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."product_images" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_images_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_images_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_images_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_markets" TO "anon";
GRANT ALL ON TABLE "public"."product_markets" TO "authenticated";
GRANT ALL ON TABLE "public"."product_markets" TO "service_role";



GRANT ALL ON TABLE "public"."product_ratings" TO "anon";
GRANT ALL ON TABLE "public"."product_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."product_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."product_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."product_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."product_suppliers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_suppliers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_suppliers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_suppliers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_variants_v2_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_variants_v2_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_variants_v2_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."products_cards_view" TO "anon";
GRANT ALL ON TABLE "public"."products_cards_view" TO "authenticated";
GRANT ALL ON TABLE "public"."products_cards_view" TO "service_role";



GRANT ALL ON TABLE "public"."products_cards_view_v2" TO "anon";
GRANT ALL ON TABLE "public"."products_cards_view_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."products_cards_view_v2" TO "service_role";



GRANT ALL ON SEQUENCE "public"."products_v2_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_v2_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_v2_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."promo_codes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."promo_codes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."promo_codes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON SEQUENCE "public"."refunds_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."refunds_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."refunds_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stock_ledger" TO "anon";
GRANT ALL ON TABLE "public"."stock_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."restock_log_v2" TO "anon";
GRANT ALL ON TABLE "public"."restock_log_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."restock_log_v2" TO "service_role";



GRANT ALL ON TABLE "public"."rls_debug_log" TO "anon";
GRANT ALL ON TABLE "public"."rls_debug_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rls_debug_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rls_debug_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rls_debug_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rls_debug_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."schema_backups" TO "anon";
GRANT ALL ON TABLE "public"."schema_backups" TO "authenticated";
GRANT ALL ON TABLE "public"."schema_backups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."schema_backups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."schema_backups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."schema_backups_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stock_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_addresses" TO "anon";
GRANT ALL ON TABLE "public"."user_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vw_catalog_overview" TO "anon";
GRANT ALL ON TABLE "public"."vw_catalog_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_catalog_overview" TO "service_role";



GRANT ALL ON TABLE "public"."vw_daily_sales_summary" TO "anon";
GRANT ALL ON TABLE "public"."vw_daily_sales_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_daily_sales_summary" TO "service_role";



GRANT ALL ON TABLE "public"."vw_delivery_queue" TO "anon";
GRANT ALL ON TABLE "public"."vw_delivery_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_delivery_queue" TO "service_role";



GRANT ALL ON TABLE "public"."vw_delivery_summary" TO "anon";
GRANT ALL ON TABLE "public"."vw_delivery_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_delivery_summary" TO "service_role";



GRANT ALL ON TABLE "public"."vw_low_stock" TO "anon";
GRANT ALL ON TABLE "public"."vw_low_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_low_stock" TO "service_role";



GRANT ALL ON TABLE "public"."vw_orders_without_user" TO "anon";
GRANT ALL ON TABLE "public"."vw_orders_without_user" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_orders_without_user" TO "service_role";



GRANT ALL ON TABLE "public"."vw_rls_activity" TO "anon";
GRANT ALL ON TABLE "public"."vw_rls_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_rls_activity" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sales_summary" TO "anon";
GRANT ALL ON TABLE "public"."vw_sales_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sales_summary" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sales_summary_monthly" TO "anon";
GRANT ALL ON TABLE "public"."vw_sales_summary_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sales_summary_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sourcing" TO "anon";
GRANT ALL ON TABLE "public"."vw_sourcing" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sourcing" TO "service_role";



GRANT ALL ON TABLE "public"."vw_todays_menu" TO "anon";
GRANT ALL ON TABLE "public"."vw_todays_menu" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_todays_menu" TO "service_role";



GRANT ALL ON TABLE "public"."vw_top_customers" TO "anon";
GRANT ALL ON TABLE "public"."vw_top_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_top_customers" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."vw_wallet_balances" TO "anon";
GRANT ALL ON TABLE "public"."vw_wallet_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_wallet_balances" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wallet_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wallet_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wallet_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wishlists" TO "anon";
GRANT ALL ON TABLE "public"."wishlists" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlists" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wishlists_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wishlists_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wishlists_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







