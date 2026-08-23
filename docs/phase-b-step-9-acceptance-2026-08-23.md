# Phase B Step 9 — End-to-End Acceptance Record

Date: 2026-08-23

## Scope

This acceptance pass verifies the Phase B application path before production rollout. Because PR #6 is still unmerged and the Phase B UI is not yet deployed, this is a pre-production acceptance pass: live catalogue shape + rollback-only activation canary + code-path regression + full CI. The final browser smoke test on meal05.com remains part of Step 10 immediately after deployment.

## First-wave catalogue acceptance

Accepted products:

- Irish Potato — ID 603
- Sweet Potato — ID 602
- Light Red Onions — ID 117
- Red Onions — ID 1004

For each product, the paid commercial option remains a weight/amount promise. Individual piece size may therefore be a preference without changing the paid quantity or value.

The rollback-only database canary successfully switched all four to `flexible_market`, asserted Standard + Tracked variant behavior and no priced `size` role, then rolled the transaction back. The production catalogue was restored to `exact_variant` after the test.

## Customer purchase path acceptance

The application path now satisfies these conditions:

1. Product Detail and Quick Add both expose the shared Preferred size control only for Flexible products.
2. `best_available` is the default preference.
3. Smaller / Medium / Larger are stored as fulfilment preferences, not commercial variants.
4. The canonical cart validates the preference against the authoritative product `selection_model`.
5. Flexible + Standard does not trigger availability confirmation.
6. Only `availability_mode = request` triggers the availability-request checkout path.
7. Order creation persists `size_preference` into `order_items` without changing price, variant, quantity, subtotal, or total.
8. Request-mode behavior remains separate and unchanged by this first-wave Flexible activation.

## Fulfilment acceptance gap found and closed

The persistence path already retained `order_items.size_preference`, but general Orders Management did not expose that field to fulfilment staff.

Step 9 adds an admin-only size-preference endpoint and updates the existing order-status control to display a `Fulfilment size preference` panel for orders containing Flexible preferences. The panel reinforces the fulfilment rule: preferred piece size guides selection only; the paid quantity or value remains authoritative.

## Safety acceptance

- No permanent catalogue activation was left in production during Steps 8–9.
- No Request products were activated.
- No availability modes were changed.
- No inventory-tracking modes were changed.
- No prices, stock counts, variant IDs, or active flags were changed.
- Coconut, White Yam, Cocoyam, and Chinese Garlic remain outside the first wave because their current commercial structures make physical size price-relevant or ambiguous.

## Step 10 gate

Step 10 may proceed only after PR #6 is green and approved. The rollout order is:

1. Merge Phase B application code.
2. Deploy the new `main` build.
3. Smoke-test ordinary cart/checkout before changing product data.
4. Permanently activate only IDs 603, 602, 117, and 1004 as `flexible_market` with the approved variation notice.
5. Browser-test Product Detail, Quick Add, cart, checkout, order persistence, and admin fulfilment preference visibility.
6. Roll back the four product flags immediately if any Flexible-specific production issue appears.

No Request product should be introduced during this first production wave.
