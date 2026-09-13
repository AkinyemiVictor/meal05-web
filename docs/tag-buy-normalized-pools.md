# Tag Buy: normalized procurement pools

## Product contract

Tag Buy changes the procurement method, not the product option. A customer first chooses an option and quantity, then chooses one of two fulfilment paths:

- **Tag Buy** — lower price, order joins a time-bound group procurement pool.
- **Buy Now** — normal price, existing immediate fulfilment flow.

The selected option and quantity stay unchanged when switching between the two paths. Tag Buy is the default only when an eligible, open pool exists for that option.

## Canonical quantity model

A pool is measured in the product's canonical procurement unit (`kg`, `l`, `piece`, and so on), not in cart lines or option counts. `tag_batch_variants.contribution_quantity` maps one unit of each shopper option into that canonical unit.

Example for one 50 kg tomato pool:

| Shopper option | Quantity ordered | Contribution |
| --- | ---: | ---: |
| 1 kg | 2 | 2 kg |
| 5 kg | 3 | 15 kg |

Both options contribute to the same 50 kg target. Prices remain option-specific and are snapshotted when the pool opens.

## Data model

- `tag_batches` is one procurement pool with minimum, target, maximum, deadline, market, purchase mode, and canonical contribution unit.
- `tag_batch_variants` contains the compatible shopper options, their contribution factors, Tag prices, and regular-price snapshots.
- `tag_commitments` reserves or commits one aggregate canonical quantity per checkout attempt/order.
- `order_items` snapshots the chosen option, paid Tag price, pool, close time, and expected procurement time for auditability.

There can be only one live pool per shopper option. Database triggers ensure members belong to the same product and market, use the same canonical unit and purchase mode, and remain genuinely discounted.

## Checkout and concurrency

1. The cart keeps Tag Buy and Buy Now lines separate and never silently switches fulfilment mode.
2. The order API reloads the live pool and all member prices from the database; client totals are not trusted.
3. `reserve_tag_capacity_v2` locks the pool, expires stale reservations, validates every cart line, converts all quantities into the canonical unit, and reserves capacity atomically.
4. Normal payment/order creation runs with an idempotency key.
5. `bind_tag_commitment_to_order_v2` revalidates order lines and binds the aggregate reservation to the created order.
6. Stock is deducted only after the existing payment-confirmation workflow confirms the Tag commitment.

This prevents overselling when multiple customers complete checkout at the same time.

## Lifecycle

```text
draft -> open -> procurement -> fulfilled
                  |
                  +-> refund_pending -> refunded
                  +-> carry forward to a compatible open pool
```

At the deadline, `close_due_tag_batches()` evaluates every due pool:

- If any submitted payment is still awaiting verification, closure is deferred and retried after staff accepts or rejects it.
- At or above the minimum: lock the pool and move it to procurement.
- Below the minimum with a valid successor: move each commitment and update its order-item pool/timing snapshots; keep the price already paid.
- Below the minimum without a valid successor: mark commitments refund-pending and cancel affected orders for the existing refund process.

The migration schedules this evaluation every five minutes with `pg_cron`. The function is idempotent because it only selects due pools still in `open` state.

## Security boundaries

- Browsers cannot insert or mutate batches, members, or commitments.
- Pool membership, aggregation views, reservation RPCs, binding RPCs, and closure RPCs are service-role only.
- Customer-visible data is returned by authenticated server routes constrained to the authenticated user.
- Row Level Security remains enabled on the underlying tables.
- Security-sensitive SQL functions pin `search_path` and critical decisions are repeated inside the database transaction.

## Admin workflow

An administrator chooses an anchor option, enters a Tag price per canonical unit, normalized minimum/target/maximum quantities, closing time, and procurement estimate. Creation includes every active, eligible compatible option whose computed price is below its regular price. The database performs the final validation and opens the pool atomically.

The admin dashboard reports normalized committed/reserved capacity and only offers carry-forward pools that are compatible by product, market, unit, option membership, and remaining capacity.

## Rollout checklist

1. Back up and apply `20260912145124_normalize_tag_buy_pools.sql` in staging.
2. Run the Supabase pgTAP suite, especially `tag_buy_rls_test.sql`.
3. Verify migrated live batches: targets and commitments should equal the old option count multiplied by that option's base quantity.
4. Create a multi-option staging pool and place simultaneous 1-unit and bulk-option Tag orders.
5. Exercise success, carry-forward, and refund-pending deadline outcomes.
6. Confirm customer order history and admin reporting reflect the current pool state.
7. Apply the migration in production during a low-checkout window, then monitor reservation failures, oversubscription errors, and scheduled-job runs.

Do not enable Tag Buy for a product until its variants have accurate `base_unit`, `base_quantity`, eligibility, purchase mode, and regular price values.
