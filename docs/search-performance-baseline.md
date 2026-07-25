# Meal05 Search Performance Baseline

Date: 2026-07-22

Scope:
- `/search?q=...` customer search path.
- Public catalogue query through `public.product_card_catalog`.
- Terms tested: `rice`, `pepper`, `peper`, `ata rodo`, `beans`, `oil`.

## Current Query Shape

The search path currently filters the `product_card_catalog` view:

```sql
select
  product_id,
  name,
  category_name,
  main_image_url,
  default_variant_id,
  unit,
  starting_price,
  old_price,
  stock_count,
  in_stock
from public.product_card_catalog
where market_id = $1
  and search_text ilike ('%' || $2 || '%')
order by product_id asc
limit 13;
```

`search_text` is a view expression built from product, market listing, category, and chosen-variant fields. A simple trigram index on `public.products.name` or even `lower(concat_ws(...))` on `public.products` does not match this full predicate.

## Remote EXPLAIN Summary

Active market: `NG`

Relevant existing indexes found:
- `product_markets.product_markets_listed_product_idx`
- `product_markets.product_markets_market_listed_idx`
- `product_variants.product_variants_card_lookup_idx`

Measured with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`:

| Term | Returned rows | Execution ms | Notes |
| --- | ---: | ---: | --- |
| `rice` | 10 | 3.364 | First run had higher planning time, likely cold plan/cache. |
| `pepper` | 5 | 2.898 | Uses existing join/lookup indexes, not trigram. |
| `peper` | 0 | 2.413 | No typo-tolerant result yet. |
| `ata rodo` | 1 | 2.404 | Exact phrase-style match works. |
| `beans` | 7 | 2.467 | Uses existing join/lookup indexes, not trigram. |
| `oil` | 4 | 2.390 | Uses existing join/lookup indexes, not trigram. |

Each run scanned about 840-860 plan-node rows in the current catalogue. This is acceptable today, but it will not scale as a typo-tolerant search strategy by itself.

## Decision

Do not apply a speculative trigram migration yet.

Reason:
- The current predicate is `search_text ilike '%term%'` on a cross-table view expression.
- A product-only trigram expression index would not reliably be used by this query.
- Existing execution time is already below 4 ms on the current catalogue.
- Adding unused indexes increases storage and write overhead without proving customer benefit.

## Next Database Options

Use one of these only after measurement shows search query time is material:

1. Add a dedicated search RPC that filters base-table columns with planner-compatible trigram predicates.
2. Add a maintained search table/materialized search catalogue with `search_text` indexed directly.
3. Add product aliases/search keywords for Nigerian market terms, then index the exact searchable document used by the endpoint.

## Repeatable Checks

Run DB plan checks:

```bash
npm run perf:search:db
```

Run page-path checks against a running local/staging app:

```bash
npm run perf:search:page -- https://your-staging-origin.example
```

Pass criteria for this slice:
- No full catalogue fetch before initial results.
- Initial result HTML is server-rendered.
- Query plan is understood and documented.
- Product-card image bytes are measured separately from document bytes.
- Search remains under the agreed payload and latency budgets on mobile-throttled testing.

## Local Page Probe

Probe command:

```bash
npm run perf:search:page -- http://localhost:3000 rice pepper peper "ata rodo" beans oil
```

Environment:
- Existing local Next dev server on port 3000.
- Dev responses use `Cache-Control: no-store, must-revalidate`, so staging/production values should be measured separately.
- The probe approximates mobile image choice by selecting a `srcset` candidate around `640w`.

| Term | Document ms | Document bytes | Product cards | Product image candidates | Product image bytes fetched | Largest product image |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `rice` | 590 | 148,674 | 10 | 10 | 312,825 | 172,072 |
| `pepper` | 495 | 113,700 | 5 | 4 | 74,830 | 20,654 |
| `peper` | 335 | 70,636 | 0 | 0 | 0 | 0 |
| `ata rodo` | 355 | 88,944 | 1 | 1 | 22,071 | 22,071 |
| `beans` | 459 | 128,538 | 7 | 7 | 266,168 | 42,445 |
| `oil` | 388 | 102,443 | 4 | 1 | 16,401 | 16,401 |

Immediate findings:
- DB time is not currently the bottleneck on the tested catalogue.
- Exact typo tolerance is still missing: `peper` returns 0 rows.
- Some product-card images are within budget, but `rice` includes one mobile `640w` candidate at 172 KB. Product image normalization/variants should be the next practical target.
- HTML document bytes remain above the desired search response budget for result-heavy terms, partly because product card data is serialized into the server-rendered page for client Quick Add hydration.

## Image Variant Backfill Probe

Date: 2026-07-22

Migration applied:
- `supabase/migrations/20260722150000_product_image_variants.sql`

Backfill result:
- `product_images` rows: 120
- Rows with `thumb_url`, `card_url`, and `detail_url`: 120
- Remaining rows without variants: 0
- Original URLs retained: 120
- Re-running the first cursor range skipped all already-normalized rows.

Probe command:

```bash
npm run perf:search:page -- http://localhost:3000 rice
```

Environment:
- Existing local Next dev server on port 3000.
- First post-backfill probe included local dev warmup and is not used for comparison.
- Warmed probe approximates a `640w` mobile candidate from `srcset`.

| Term | Document ms | Document bytes | Product cards | Product image candidates | Product image bytes fetched | Largest product image |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `rice` | 1,679 | 151,557 | 10 | 10 | 120,408 | 40,735 |

Result:
- `rice` first-card image transfer dropped from 312,825 bytes to 120,408 bytes for the first 10 product image candidates.
- Largest fetched card image dropped from 172,072 bytes to 40,735 bytes.
- Product card URLs now point at `product-images/{productId}/{productImageId}/card.webp` for backfilled catalogue images.

Remaining browser QA:
- Measure real mobile-throttled first visible cards in Chrome/Playwright.
- Confirm Quick Add interactivity timing with hydration, not just HTML output.
- Check production/staging cache behavior separately from local dev `no-store` responses.

## Production Browser Probe

Date: 2026-07-22

Probe command:

```bash
npm run build
npm run start -- -p 3001
npm run perf:search:browser -- http://localhost:3001 rice
npm run perf:search:browser -- http://localhost:3001 chicken
```

Environment:
- Local production build through `next start`.
- Playwright Chromium, Pixel 5 viewport.
- Mobile throttle: 150 ms latency, about 1.6 Mbps down, 750 Kbps up, 4x CPU throttle.
- `rice` is currently fully out of stock, so it is useful for page/image measurement but not Quick Add.
- `chicken` includes one enabled product in the current catalogue and is used for Quick Add interaction timing.

### Rice Page Load

| Pass | TTFB | FCP | LCP | CLS | First cards visible | Total bytes | JS bytes | Product image bytes | Largest product image |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold, cache disabled | 477 ms | 2,252 ms | 2,744 ms | 0 | 2,687 ms | 610,685 | 239,712 | 119,010 | 43,890 |
| Repeat, cache enabled | 70 ms | 216 ms | 656 ms | 0 | 521 ms | 63,317 | 0 | 5,472 | 548 |

### Chicken Quick Add

Before optimistic Quick Add, the drawer opened quickly but waited on `/api/products/505` before the CTA became usable:

| State | Drawer visible | CTA ready | Final add | Product detail request |
| --- | ---: | ---: | ---: | ---: |
| Before | 255 ms | 2,693 ms | 216 ms | 2,293 ms |
| After | 376 ms | 387 ms | 274 ms | not blocking |

The first click now seeds Quick Add from the server-rendered product-card DTO when it already includes a valid default variant. The product-detail API still refreshes richer variants, but the common one-tap add path no longer waits for it.

The product-detail API was also changed to `no-store` because stale cached variant payloads can make an in-stock card open as out-of-stock in Quick Add.

## Cold LCP Refinement

Date: 2026-07-22

Changes verified:
- The visible `/search` submit icon now uses the existing SVG icon set, so the initial search path no longer fetches the FontAwesome solid webfont for one icon.
- FontAwesome fallback display was changed from blocking to swap for routes that still use icon fonts.
- The global Google Fonts CSS import was removed. The app now uses the local Geist sans font token with system fallbacks, and the unused global Geist mono preload was removed.
- The mobile `PageScaler` keeps the existing scaled layout, but its initial transform is available from CSS before React effects run. JavaScript now only corrects the exact scale and measured document height after mount.

Probe command:

```bash
npm run build
npm run start -- -p 3006
npm run perf:search:browser -- http://localhost:3006 rice
```

Final measured cold pass:

| Metric | Before LCP pass | After LCP pass |
| --- | ---: | ---: |
| TTFB | 477 ms | 96 ms |
| FCP | 2,252 ms | 1,388 ms |
| LCP | 2,744 ms | 1,388 ms |
| CLS | 0 | 0 |
| First cards visible | 2,687 ms | 1,603 ms |
| Total bytes | 610,685 | 380,176 |
| JS bytes | 239,712 | 175,810 |
| Product image bytes | 119,010 | 119,010 |
| Font bytes | 41,916+ on earlier traces | 0 |

Notes:
- Product-image bytes are unchanged in this pass because the image-normalization slice had already fixed that bottleneck.
- The LCP resource is now discovered early and rendered without the previous post-image paint delay.
- A visual screenshot check on the Pixel 5 profile completed without page errors after the scaler guard fix.

## Route Prefetch Trim

Date: 2026-07-25

Change:
- Kept the mobile `PageScaler` in the root layout because it is required for the current webapp visual structure.
- Disabled automatic Next.js route prefetching on search-shell navigation links: header logo, mobile bottom nav, account/header action links, breadcrumbs, and search fallback CTAs.
- Product-card links already had `prefetch={false}`, so no product-card behavior changed.

Probe command:

```bash
npm run build
npm run start -- -p 3007
npm run perf:search:browser -- http://localhost:3007 rice
```

Final measured cold pass:

| Metric | Before prefetch trim | After prefetch trim |
| --- | ---: | ---: |
| Total requests | 56 | 30 |
| Total bytes | 380,176 | 320,782 |
| JS bytes | 175,810 | 146,908 |
| CSS bytes | 49,770 | 38,202 |
| Product image bytes | 119,010 | 119,010 |
| LCP | 1,388 ms | 1,532 ms |
| First cards visible | 1,603 ms | 1,703 ms |
| CLS | 0 | 0 |

Result:
- Removed about 59 KB from the cold search transfer and avoided 26 background requests.
- The small LCP/first-card timing movement is within local throttled-run variance; the concrete win is reduced competing network work while preserving the scaler-backed mobile layout.
