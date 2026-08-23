# Meal05 Flexible Market — First-Wave Activation

Date: 2026-08-23

## Purpose

This is the controlled activation package for Phase B Step 8. It deliberately separates Flexible selection from Request-mode availability.

The first production wave is:

| Product | ID | Selection model | Availability mode | Inventory mode |
| --- | ---: | --- | --- | --- |
| Irish Potato | 603 | `flexible_market` | `standard` | keep current (`tracked`) |
| Sweet Potato | 602 | `flexible_market` | `standard` | keep current (`tracked`) |
| Light Red Onions | 117 | `flexible_market` | `standard` | keep current (`tracked`) |
| Red Onions | 1004 | `flexible_market` | `standard` | keep current (`tracked`) |

No Request product is part of this first wave.

## Customer variation notice

> Fresh produce naturally varies. Size, shape, weight and number of pieces may differ depending on what is available at the farm or market. We'll aim to match your preference while ensuring you receive the quantity or value represented by the option you paid for.

The commercial variant remains authoritative. Preferred physical size must not alter price, selected variant, paid quantity, total weight, or paid value.

## Preconditions checked on the live catalogue

Before activation, all four products were verified as active and `exact_variant`. Their active variants use weight/amount commercial options, have no `option_role = size`, remain `availability_mode = standard`, and remain `inventory_tracking_mode = tracked`.

This means Step 8 does not mix a Flexible-selection rollout with delayed availability confirmation or an inventory-model migration.

## Rollback-only canary completed

A transaction-only live-database canary was executed before production activation:

1. Begin a transaction.
2. Switch only product IDs `603`, `602`, `117`, and `1004` to `selection_model = flexible_market`.
3. Apply the approved variation notice.
4. Assert exactly four active products are Flexible.
5. Assert zero active variants on those products changed away from `availability_mode = standard` or `inventory_tracking_mode = tracked`.
6. Assert zero active variants use the priced `size` option role.
7. Roll the transaction back.
8. Re-check that all four products are again `exact_variant` with their original null variation notes.

The canary passed. The live catalogue was restored immediately after the test.

## Why production remains unchanged before Step 10

PR #6 contains the customer UI and backend behavior required to interpret `flexible_market`. Until that code is merged and deployed, permanently changing the production catalogue would expose the existing production storefront to a model it was not deployed to present.

Therefore the permanent product-data flip is intentionally part of Phase B Step 10 immediately after the Phase B code is merged and deployed.

## Step 10 production activation

After the Phase B application build is live, apply only this product update:

```sql
update products
set selection_model = 'flexible_market',
    variation_note = 'Fresh produce naturally varies. Size, shape, weight and number of pieces may differ depending on what is available at the farm or market. We''ll aim to match your preference while ensuring you receive the quantity or value represented by the option you paid for.'
where id in (603, 602, 117, 1004)
  and is_active = true;
```

Do not change `availability_mode`, `inventory_tracking_mode`, prices, stock counts, active flags, or variant IDs as part of this activation.

## Emergency rollback

If the production smoke test exposes a Flexible-selection problem, restore only these four products:

```sql
update products
set selection_model = 'exact_variant',
    variation_note = null
where id in (603, 602, 117, 1004);
```

This rollback does not alter orders already created; any persisted `order_items.size_preference` remains historical fulfilment data.
