alter table public.products
  add column if not exists fulfillment_type text not null default 'market_sourced';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_fulfillment_type_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_fulfillment_type_check
      check (fulfillment_type in ('stocked', 'market_sourced'));
  end if;
end $$;

update public.products
set fulfillment_type = 'stocked'
where category_id = 7
  and name in ('Dates', 'Coconut (Small)', 'Coconut (Medium)', 'Coconut (Big)');

update public.products
set fulfillment_type = 'market_sourced'
where category_id = 7
  and name not in ('Dates', 'Coconut (Small)', 'Coconut (Medium)', 'Coconut (Big)');;
