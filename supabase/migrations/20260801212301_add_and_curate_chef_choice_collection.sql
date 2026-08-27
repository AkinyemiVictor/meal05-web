alter table public.products
  add column if not exists is_chef_choice boolean not null default false,
  add column if not exists chef_choice_sort_order integer;

comment on column public.products.is_chef_choice is
  'Curated premium, farmer-sourced, speciality, aromatic, or exotic ingredient selected for the Chef Choice collection.';
comment on column public.products.chef_choice_sort_order is
  'Display order within Chef Choice; lower numbers appear first.';

update public.products
set is_chef_choice = false,
    chef_choice_sort_order = null
where is_chef_choice is distinct from false
   or chef_choice_sort_order is not null;

with curated(name, sort_order) as (
  values
    ('Farmer''s Ofada Rice', 10),
    ('Farmer''s Rice (Long Grain)', 20),
    ('Farmer''s Rice (Short Grain)', 30),
    ('Premium White Garri (Ilora)', 40),
    ('Premium Ijebu Garri', 50),
    ('Maiduguri Honey Beans (Oloyin)', 60),
    ('Hand-Peeled Melon Seeds (Egusi)', 70),
    ('Bush Mango Seeds (Ogbono)', 80),
    ('Farmer''s Honey', 90),
    ('Farmer''s Palm Oil', 100),

    ('Large Prawns', 200),
    ('Croaker Fish', 210),
    ('Snails - Big', 220),
    ('Smoked Farmed Catfish - Big', 230),
    ('Fresh Processed Catfish - Big', 240),
    ('Stockfish Pieces (Flesh)', 250),
    ('Crayfish', 260),
    ('Boneless Goat Meat', 270),
    ('Bone-In Goat Meat', 280),
    ('Boneless Beef', 290),

    ('Black Peppercorns', 400),
    ('Chinese Garlic', 410),
    ('Ginger', 420),
    ('Turmeric', 430),
    ('Cloves', 440),
    ('Alligator Pepper', 450),
    ('Uziza Leaves', 460),
    ('Scent Leaf (Clove Basil)', 470),
    ('Okazi Leaves', 480),
    ('Fermented Locust Beans (Iru) - Big Pack', 490),
    ('Scotch Bonnet Pepper (Ata Rodo) - Grade A', 500),
    ('Red Bell Pepper (Tatase) - Grade A', 510),
    ('Cayenne Pepper (Sombo) - Grade A', 520),
    ('Fresh Tomato - Grade A', 530),
    ('Mixed Bell Peppers', 540),
    ('Green Bell Pepper', 550),

    ('Blueberries', 700),
    ('Nigerian Strawberry', 710),
    ('Avocado (Hass)', 720),
    ('Imported Red Grapes', 730),
    ('Imported Green Grapes', 740),
    ('Soursop', 750),
    ('Dates', 760),
    ('Pineapple - Semi-Ripe (Big)', 770),
    ('Lemon', 780),
    ('Coconut (Big)', 790)
)
update public.products p
set is_chef_choice = true,
    chef_choice_sort_order = curated.sort_order,
    updated_at = now()
from curated
where lower(btrim(p.name)) = lower(btrim(curated.name));

create index if not exists products_chef_choice_order_idx
  on public.products (is_chef_choice, chef_choice_sort_order, id)
  where is_chef_choice = true;;
