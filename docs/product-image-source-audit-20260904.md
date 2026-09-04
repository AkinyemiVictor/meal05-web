# Product image source audit — 4 September 2026

## Storefront source of truth

The active storefront path is database-driven:

`product_images` → `product_card_catalog_with_options` → catalogue mapper → `ProductCard`

The database view selects the primary image's `card_url` before `products.main_image_url` and also exposes `thumb_image_url`, `card_image_url`, `detail_image_url`, and `original_image_url`. The public catalogue mapper now preserves those responsive URLs explicitly.

## Repository findings

- Removed `src/data/products.js`. It was unreferenced legacy data containing 162 products, 299 hardcoded `/assets/products/...` references, and 228 unique nonexistent paths.
- There is no `public/assets/products` directory.
- There are no product-image binary files outside `public/`.
- Files under `public/` are retained for logos, favicons, icons, payment marks, marketing artwork, empty-cart artwork, and the generic product placeholder.
- `src/lib/product-image.js` retains a defensive check for one obsolete tomato path. It is not an image source; it converts that broken historical value to the placeholder. The live database contains zero matching rows.
- Historical Supabase schema files contain 38 direct `product-images` Storage URL occurrences across seven files and one `/api/product-assets/` occurrence. These are migration history, not active runtime catalogue data, and must not be rewritten retroactively.

## Live database inventory

There are 237 active products:

- 197 have a primary `product_images` row.
- 171 currently resolve directly from the Supabase `product-images` Storage bucket.
- 30 resolve through the legacy `/api/product-assets/{assetKey}` blob endpoint. These already have `product_images` rows, but their bytes should be moved from `product_image_blobs` to Storage before retiring the endpoint.
- 4 have a direct Supabase Storage URL in `products.main_image_url` but no primary `product_images` row.
- 36 have no image.
- 0 active products resolve from `/assets/...` or an unrelated external host.

### Legacy blob-backed products to migrate to Storage

There are 30 products using 29 unique blob assets (the two Golden Penny spaghetti products share one asset):

| Product ID | Product | Asset key |
| ---: | --- | --- |
| 894 | Crown Premium Spaghetti (Slim) | crown-premium-spaghetti-slim |
| 924 | Crown Premium Spaghetti (Standard) | crown-premium-spaghetti |
| 899 | Golden Penny Macaroni | golden-penny-macaroni |
| 921 | Golden Penny Pasta Twist | golden-penny-pasta-twist |
| 1017 | Golden Penny Semovita (10kg) | golden-penny-semovita-10kg |
| 1014 | Golden Penny Semovita (1kg) | golden-penny-semovita-1kg |
| 1015 | Golden Penny Semovita (2kg) | golden-penny-semovita-2kg |
| 1013 | Golden Penny Semovita (500g) | golden-penny-semovita-500g |
| 1016 | Golden Penny Semovita (5kg) | golden-penny-semovita-5kg |
| 869 | Golden Penny Soya Oil (1L) | golden-penny-soya-oil-1l |
| 1008 | Golden Penny Spaghetti (Slim) | golden-penny-spaghetti |
| 887 | Golden Penny Spaghetti (Standard) | golden-penny-spaghetti |
| 1026 | Golden Terra Oil (1.4L) | golden-terra-oil-1-4l |
| 1019 | Honeywell Semolina (10kg) | honeywell-semolina-10kg |
| 1018 | Honeywell Semolina (1kg) | honeywell-semolina-1kg |
| 1029 | King's Soya Oil (5L) | kings-soya-oil-5l |
| 1027 | King's Vegetable Oil (1L) | kings-vegetable-oil-1l |
| 1028 | King's Vegetable Oil (2L) | kings-vegetable-oil-2l |
| 802 | King's Vegetable Oil (5L) | kings-vegetable-oil-5l |
| 117 | Light Red Onions | light-red-onions-main |
| 1020 | Mama Gold Semolina (1kg) | mama-gold-semolina-1kg |
| 1021 | Mama Gold Semolina (5kg) | mama-gold-semolina-5kg |
| 892 | Mama's Pride Spaghetti (Slim) | mamas-pride-spaghetti-slim |
| 891 | Mama's Pride Spaghetti (Standard) | mamas-pride-spaghetti-standard |
| 1009 | Mama's Pride Twist Cavatto | mamas-pride-cavatto |
| 1010 | Mr Chef Salt (1kg) | mr-chef-salt-1kg |
| 1011 | Mr Chef Salt (250g) | mr-chef-salt-250g |
| 1012 | Mr Chef Salt (500g) | mr-chef-salt-500g |
| 1004 | Red Onions | red-onions-main |
| 805 | Shallots | shallots-main |

`product_image_blobs` contains 34 assets. Five are not used as the effective image of an active product: `golden-penny-wheat-1kg`, `golden-penny-wheat-5kg`, `light-red-onions-supplemental`, `red-onions-supplemental`, and `shallots-supplemental`.

### Storage URLs needing a primary product_images row

- 1049 — Orange - Semi-Ripe (Large)
- 1050 — Banana (Cavendish) - Small
- 1051 — Banana (Cavendish) - Large
- 1053 — Watermelon - Big

### Active products still missing an image

- Achi Powder; Assorted Turkey cuts; Black Peppercorns; Bush Mango Seeds (Ogbono)
- Cassava Flour (Lafun); Cassava Flour (Pupuru/Kpukpuru); Cucumber; Dangote Refined Granulated Sugar
- Golden Star India Parboiled Rice; Green Bell Pepper; Ground Chili Pepper
- Lagos Spinach (Efo Shoko) - Big; Lagos Spinach (Efo Shoko) - Small; Laziz Pure Vegetable Oil (45ml)
- Millet; Napa Sardine; Ofor Powder; PAP (Ogi/Akamu); Peeled Melon Seeds (Egusi)
- Plantain Flour (Elubo Ogede); Processed Fonio (Acha); Processed Spent Layer Chicken
- Red Guinea Corn (Okababa); Roasted Groundnut (With Peel); Roasted Groundnut (With Shell)
- Smoked Bonga Shad (Agbodo); Smoked Hake Fish; Smoked Pomo
- Thaumatococcus Leaves (Moi Moi Leaves); Titus Sardine; Turkey Gizzard; Turkey Laps; Turkey Mid-Wings; Turkey Wings
- Ukpo Powder; Wheat Flour

## Recommended migration order

1. Add primary `product_images` rows for the four existing Storage URLs; no new image files are required.
2. Review the 29 legacy blob images for quality, especially Golden Penny Pasta Twist, then move approved assets into the `product-images` bucket and generate responsive variants.
3. Upload approved photos for the 36 missing products using the batch importer.
4. After no active database URL contains `/api/product-assets/`, remove the legacy blob route and compatibility URL refresh code.
