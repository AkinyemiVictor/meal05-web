# Meal05 Flexible Availability Catalogue Audit

Date: 2026-08-23

## Scope and safety rule

This is an audit and rollout recommendation only. **No product, variant, availability mode, inventory mode, price, stock value, or active/inactive flag was changed by this audit.**

`products.selection_model` remains the authoritative source for Exact vs Flexible behavior. `product_variants.availability_mode` remains the authoritative source for Standard vs Request vs Unavailable behavior. Product names are not used as an automatic conversion rule.

Selection and availability remain independent:

- Exact + Standard
- Exact + Request
- Flexible + Standard
- Flexible + Request

A Flexible product does not automatically require availability confirmation.

## Live catalogue snapshot

At the time of this audit:

- 189 products are active.
- 139 products are inactive/hidden.
- All 189 active products are currently `exact_variant`.
- 0 active products are currently `flexible_market`.
- 772 variants are active.
- All active variants are currently `availability_mode = standard`.
- All active variants are currently `inventory_tracking_mode = tracked`.
- 185 active products are tagged `market_sourced`; 4 are tagged `stocked`.
- 15 active products are tagged `fresh`.
- 13 active products are marked price-volatile.
- 88 active products currently have zero stock across all active variants.

The stock history is too sparse to treat those zero values as reliable sourcing evidence. `stock_ledger` has only 41 entries covering 34 variants, and `restock_log_v2` has 38 entries covering 31 variants, compared with 772 active variants. Therefore, a zero stock value is an **operations-review signal**, not automatic evidence for Request, Unavailable, or Hidden.

## Classification rules

### Exact

Keep a product Exact when the option the customer chooses is itself a priced commercial promise: manufacturer pack, exact weight tier, exact count tier, ripeness, grade, form/cut, or a physical size class that changes price/value.

### Flexible

Use Flexible only when the paid commercial option remains authoritative without guaranteeing individual piece size. A strong example is a produce product sold by total weight where the customer may prefer smaller or larger individual pieces while still receiving the purchased total weight/value.

### Standard

Use Standard when sourcing confidence is high enough that the customer should be allowed to pay normally. Operationally, the target should be roughly 95%+ confidence rather than routing routine purchases into confirmation.

### Request

Use Request only for a useful product with genuine sourcing uncertainty. A rough operating band is about 60–95% confidence. Request should remain a small exception because it introduces conversion delay.

### Unavailable

Use Unavailable for a product that is normally sold but has a known temporary availability problem.

### Hidden / inactive

Use Hidden for products that are too unreliable, low-priority, or operationally expensive to present to customers. The existing 139 inactive products should remain hidden unless deliberately reviewed and reactivated.

## First-wave Flexible + Standard candidates

These are the safest candidates to test the Flexible preference model because their commercial options are based primarily on total weight/amount, while individual piece size can vary without changing what the customer paid for.

| Product | ID | Current commercial options | Proposed selection | Proposed availability | Reason |
| --- | ---: | --- | --- | --- | --- |
| Irish Potato | 603 | 250g, 500g, 1kg, 4kg bucket, 25/50/100kg | Flexible candidate | Standard candidate | Purchased total weight remains authoritative; potato piece size can be preference-only. |
| Sweet Potato | 602 | 1kg, 3.5kg bucket, 10/25/50/100kg | Flexible candidate | Standard candidate | Purchased total amount remains authoritative; individual tuber size can vary. |
| Light Red Onions | 117 | 250g, 500g, 1kg, 10/25/50/100kg | Flexible candidate | Standard candidate | Weight/value is commercial promise; bulb size can be preference-only. |
| Red Onions | 1004 | 250g, 1kg, 10/25/50/100kg | Flexible candidate | Standard candidate | Weight/value is commercial promise; bulb size can be preference-only. |

These four should still receive a final human catalogue check before Step 8 activation, especially to confirm the displayed units and fulfilment wording. They should **not** be changed to Request merely because physical sizes vary.

## Flexible redesign candidates — do not activate as Flexible yet

These products currently encode physical size inside product identity or price. Simply flipping `selection_model` would create misleading commerce behavior.

| Product | IDs | Current issue | Required redesign before Flexible |
| --- | --- | --- | --- |
| Coconut Small / Medium / Big | 958, 23, 959 | Separate products and prices are tied to physical size; each also has count packs. | Decide whether to consolidate into one Coconut commercial product with count/value tiers while keeping physical size as preference. Preserve existing IDs/history during any migration. |
| White Yam (Mumuyi) Small / Medium / Big | 967, 970, 968 | Size class is embedded in product identity and changes the price of tuber-count packs. | Redesign commercial tiers around count/weight/value before making size preference non-priced. |
| Cocoyam | 604 | Small ₦1,000, Medium ₦2,000, Large ₦3,000; `option_role = size`. | Replace priced size tiers with authoritative amount/value/weight tiers before Flexible. |
| Chinese Garlic | 711 | Mixes one-piece purchasing with 500g and 1kg packs. | Decide whether piece and weight sales should remain one product. Flexible should not make a priced one-piece promise ambiguous. |

## Keep Exact — high-confidence examples

The following illustrate cases where Exact remains the safer model:

- Dates (ID 25): 500g / 700g / 1.4kg commercial quantity tiers.
- Fresh Processed Catfish - Medium (ID 311): product identity already promises Medium and prices are attached to count packs.
- Fresh Processed Catfish - Big (ID 974): product identity already promises Big and prices are attached to count packs.
- Smoked Farmed Catfish - Medium (ID 873): count tiers and a Medium commercial identity; also price-volatile.
- Dried Pomo (ID 874): Small and Big have different per-piece prices.
- Chicken Eggs (ID 505): exact piece/count tiers (1, 6, 15, 30). Current zero stock is an availability question, not a reason to make the selection Flexible.
- Whole Turkey (ID 235): currently inactive; approximately 5/6/7/8/10kg options are commercial weight/size tiers and should remain Exact if reactivated in this structure.
- Manufacturer packs, ripeness, grade, form/cut/process, and genuinely exact count/weight choices elsewhere in the catalogue should remain Exact by default.

## Availability operations-review queue

The database can identify products that deserve a sourcing review, but it cannot safely decide Request vs Unavailable vs Hidden without current supplier knowledge.

### Active products with both volatile pricing and/or complete zero-stock signals

- Chicken Eggs (505) — all four active variants currently zero.
- Dried Pomo (874) — price-volatile; all active variants zero.
- Farmer's Honey (876) — price-volatile; all active variants zero.
- Achi Powder (884) — price-volatile; zero.
- Kpukpuru / Pupuru / Kukuru Cassava Flour (881) — price-volatile; zero.
- Lafun / Cassava Flour (880) — price-volatile; zero.
- Ofor Powder (885) — price-volatile; zero.
- Plantain Flour (879) — price-volatile; zero.
- Ukpo Powder (886) — price-volatile; zero.
- Ground Chili Pepper (872) — price-volatile; zero.
- Shallots (805) — zero.

### Volatile products that currently have positive stock values

These still deserve supplier-price review, but current data does not justify moving them to Request:

- Smoked Farmed Catfish - Medium (873)
- Bush Mango Seeds / Ogbono (883)
- Hand-Peeled Melon Seeds / Egusi (882)
- Yam Flour / Elubo Isu (878)

For every product in this queue, operations should answer:

1. Can we source it on at least ~95% of normal shopping days? → Standard.
2. Can we usually source it but with meaningful uncertainty? → Request.
3. Is it normally reliable but temporarily unavailable right now? → Unavailable.
4. Is it too unreliable to advertise at launch? → Hidden/inactive.

Do not use zero `stock_count` alone to answer these questions.

## Category-level review signals

The current active catalogue has a large number of zero-stock variants, especially in Pantry & Processed Foods, Grains & Cereals, and Spices & Condiments. Because stock history covers only a small fraction of active variants, this indicates that inventory data needs operational normalization before it can be used as a sourcing-confidence classifier.

The inactive catalogue is already heavily concentrated in Meat & Poultry, Vegetables, Fruits, and Fish & Seafood. Those 139 inactive products should remain hidden during the first rollout rather than being reintroduced simply to exercise the new Request flow.

## Step 8 activation recommendation

Use a controlled first wave that tests **Flexible selection without simultaneously testing availability delay**:

1. Manually verify Irish Potato (603), Sweet Potato (602), Light Red Onions (117), and Red Onions (1004) in the admin/product UI.
2. If their commercial weight/value options are correct, activate `selection_model = flexible_market` for only 2–4 of them.
3. Keep their variants `availability_mode = standard` for the first test unless operations explicitly reports genuine sourcing uncertainty.
4. Keep `inventory_tracking_mode` unchanged until the stock/supplier operating model for each product is deliberately confirmed.
5. Test Product Detail, Quick Add, Cart, normal checkout, order item persistence, and admin fulfilment preference visibility.
6. Only after that succeeds should Meal05 activate a small number of Request-mode products chosen from an explicit supplier-confidence review.

This separates two risks:

- Flexible preference tests whether the customer understands preferred physical size without changing purchased value.
- Request mode tests whether delayed availability confirmation converts acceptably.

They should not be introduced together on the same first-wave product unless there is a genuine business need.

## Audit conclusion

The catalogue is safe to move into a controlled Step 8, but it is **not** safe to bulk-convert products by name, category, zero stock, or `fresh` tag. The best first-wave candidates are the weight-based potatoes and onions above. Coconut, yam, cocoyam, and mixed piece/weight garlic need commercial-model review first. Availability mode should be decided from actual sourcing confidence, not inferred from the current stock table.
