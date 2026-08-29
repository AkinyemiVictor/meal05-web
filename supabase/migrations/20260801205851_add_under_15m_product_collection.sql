alter table public.products
  add column if not exists is_under_15m boolean not null default false,
  add column if not exists prep_minutes smallint,
  add column if not exists under_15m_sort_order integer;

alter table public.products
  drop constraint if exists products_prep_minutes_valid;
alter table public.products
  add constraint products_prep_minutes_valid
  check (prep_minutes is null or prep_minutes between 0 and 15);

alter table public.products
  drop constraint if exists products_under_15m_sort_order_valid;
alter table public.products
  add constraint products_under_15m_sort_order_valid
  check (under_15m_sort_order is null or under_15m_sort_order >= 0);

comment on column public.products.is_under_15m is
  'True when the product can be cooked, washed, peeled, cut, opened, or eaten within 15 minutes.';
comment on column public.products.prep_minutes is
  'Estimated preparation time in minutes for the Under 15m storefront collection.';
comment on column public.products.under_15m_sort_order is
  'Display priority for the Under 15m collection. Pantry products use lower values than fruits and other quick items.';

with quick_products(name, prep_minutes, sort_order) as (
  values
    -- Instant noodles and quick pantry meals first.
    ('Indomie Instant Noodles Chicken Flavour', 5, 10),
    ('Indomie Instant Noodles Chicken Belle Full', 6, 11),
    ('Indomie Instant Noodles Onion Chicken Flavour', 5, 12),
    ('Indomie Instant Noodles Chicken Pepper Soup', 6, 13),
    ('Indomie Instant Noodles Crayfish Flavour', 5, 14),
    ('Indomie Instant Noodles Oriental Fried', 5, 15),
    ('Indomie Relish Beef Flavour with Soya Chunks', 6, 16),
    ('Golden Penny Instant Noodles', 5, 20),
    ('Golden Penny Instant Noodles Chicken Flavour', 5, 21),
    ('Golden Penny Instant Noodles Jollof Chicken Flavour', 5, 22),
    ('Minimie Instant Noodles Chicken Flavour', 5, 25),
    ('Minimie Instant Noodles Party Jollof', 5, 26),
    ('Minimie Instant Noodles Pepper Flavour', 5, 27),
    ('Masters Instant Noodles Chicken Flavour', 5, 28),
    ('Sedaap Supreme Tasty Chicken Instant Noodles', 5, 29),

    -- Pasta and other fast pantry products.
    ('Lamis Pasta Vermicelli', 8, 40),
    ('Golden Penny Macaroni', 10, 41),
    ('Golden Penny Pasta Twist', 12, 42),
    ('Lamis Pasta Fusilli', 12, 43),
    ('Lamis Pasta Penne Lisce', 12, 44),
    ('Lamis Pasta Penne Rigate', 12, 45),
    ('Simply Penne', 12, 46),
    ('Lamis Pasta Ragati Curve', 12, 47),
    ('Lamis Pasta Rigatoni', 14, 48),
    ('Lamis Pasta Tagliatelle', 10, 49),
    ('Golden Penny Spaghetti', 10, 50),
    ('Lamis Spaghetti', 10, 51),
    ('Auntie B Spaghetti', 10, 52),
    ('Auntie B Slim Spaghetti', 10, 53),
    ('Crown Premium Slim Spaghetti', 10, 54),
    ('Crown Spaghetti', 10, 55),
    ('Honeywell Slim Spaghetti', 10, 56),
    ('Mama''s Pride Spaghetti', 10, 57),
    ('Mama''s Pride Slim Spaghetti', 10, 58),
    ('Minimie Spaghetti', 10, 59),
    ('Napolina Spaghetti', 11, 60),
    ('Power Pasta Slim Spaghetti', 10, 61),
    ('Tesco Organic Spaghetti', 11, 62),
    ('Tesco Whole Wheat Spaghetti', 12, 63),
    ('Pap (Ogi/Akamu)', 10, 70),

    -- Ready-to-eat and quick-cut fruits.
    ('Bananas (Cavendish)', 1, 100),
    ('Small Bananas (Omini)', 1, 101),
    ('Blueberries', 1, 102),
    ('Nigerian Strawberry', 2, 103),
    ('Imported Red Grapes', 2, 104),
    ('Imported Green Grapes', 2, 105),
    ('Dates', 1, 106),
    ('Red Apples', 2, 107),
    ('Apple (Green)', 2, 108),
    ('Irish Peach Apples', 2, 109),
    ('European Pear (English Pear)', 2, 110),
    ('German Mango', 3, 111),
    ('Ogbomosho Mango', 3, 112),
    ('Sheri Mango', 3, 113),
    ('Guava (White)', 2, 114),
    ('African Star Apple (Agbalumo)', 2, 115),
    ('Sweet Orange - Semi-Ripe (Medium)', 3, 116),
    ('Avocado', 3, 117),
    ('Avocado (Hass)', 3, 118),
    ('Pawpaw (Solo Papaya)', 5, 119),
    ('Watermelon', 5, 120),
    ('Pineapple - Semi-Ripe (Big)', 6, 121),
    ('Soursop', 5, 122),
    ('Cashew', 2, 123),

    -- Other products that are ready quickly.
    ('Chicken Eggs', 10, 200),
    ('Cucumber', 3, 201),
    ('Lettuce', 5, 202),
    ('Washed Carrots', 4, 203),
    ('Garden Egg (Green)', 2, 204),
    ('Garden Egg (White)', 2, 205),
    ('Roasted Groundnut (Shelled)', 0, 206),
    ('Roasted Groundnut (With Shell)', 2, 207),
    ('Tiger Nuts', 2, 208),
    ('Tiger Nut (Dried)', 2, 209)
)
update public.products p
set is_under_15m = true,
    prep_minutes = q.prep_minutes,
    under_15m_sort_order = q.sort_order,
    updated_at = now()
from quick_products q
where p.name = q.name;

create index if not exists products_under_15m_collection_idx
  on public.products (is_under_15m, under_15m_sort_order, id)
  where is_under_15m = true and is_active = true;;
