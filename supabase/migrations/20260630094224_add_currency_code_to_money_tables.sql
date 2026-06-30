alter table public.product_variants    add column currency_code text not null default 'NGN';
alter table public.orders              add column currency_code text not null default 'NGN';
alter table public.order_items         add column currency_code text not null default 'NGN';
alter table public.payments            add column currency_code text not null default 'NGN';
alter table public.daily_menu_items    add column currency_code text not null default 'NGN';
alter table public.wallet_transactions add column currency_code text not null default 'NGN';
alter table public.refunds             add column currency_code text not null default 'NGN';
