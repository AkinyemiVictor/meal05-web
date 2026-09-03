# Product Image Batch Import

Use `npm run images:import` when a batch has mixed primary replacements, secondary gallery images, and product size variants.

The importer does not infer product families. Each image must map to one exact product by `productId`, `sku`, or an exact unambiguous `productName`. This keeps branded products separate: Dangote spaghetti images go only on the Dangote spaghetti product, and Dangote macaroni images go only on the Dangote macaroni product.

For unbranded products like rice, beans, and gari, put every representative image under that single product in the manifest. Variant sizes of one product can also stay in that product gallery.

## Rules

- `role: "primary"` appends the image and makes it the product's main image.
- `role: "replace"` updates the current primary row in place and uses versioned Storage paths so corrected images cannot be hidden by stale CDN copies. If no image exists yet, it creates the primary image.
- `role: "gallery"` appends a secondary image.
- Only one primary image is allowed per product in one import.
- The script creates `thumb`, `card`, and `detail` WebP variants and saves the original.
- The database gallery order is controlled by `product_images.position`.
- The script defaults to dry-run. Nothing is uploaded unless `--commit` is passed.

## September 2026 corrected-image batch

The exact product mappings are saved in `scripts/product-image-batch-20260903.json`. Extract the supplied `new set.zip`, dry-run with its folder as `--root`, then repeat with `--commit`:

```powershell
npm run images:import -- --manifest=scripts/product-image-batch-20260903.json --root="C:\path\to\new set" --batch-id=20260903-corrected-images
npm run images:import -- --manifest=scripts/product-image-batch-20260903.json --root="C:\path\to\new set" --batch-id=20260903-corrected-images --commit
```

Keep the batch ID unchanged when resuming an interrupted run. The correctly spelled `ayoola poundo yam 0.9kg.png` is the selected 900g image; the older `ayoola poudo yam 0.9kg.png` file is intentionally unused.

## Example

```json
{
  "root": "./product-image-batch",
  "items": [
    {
      "sku": "DANGOTE-SPAGHETTI-500G",
      "files": [
        { "path": "dangote/spaghetti/front.jpg", "role": "primary" },
        { "path": "dangote/spaghetti/side.jpg", "role": "gallery" }
      ]
    },
    {
      "sku": "DANGOTE-MACARONI-500G",
      "file": "dangote/macaroni/front.jpg",
      "role": "primary"
    },
    {
      "productName": "Rice",
      "files": [
        { "path": "unbranded/rice/bag.jpg", "role": "primary" },
        "unbranded/rice/grains.jpg",
        "unbranded/rice/close-up.jpg"
      ]
    }
  ]
}
```

## Commands

Dry-run first:

```bash
npm run images:import -- --manifest=product-image-batch.json
```

Upload and write to Supabase:

```bash
npm run images:import -- --manifest=product-image-batch.json --commit
```

If your image folder is outside the manifest folder:

```bash
npm run images:import -- --manifest=product-image-batch.json --root=C:\path\to\images --commit
```
