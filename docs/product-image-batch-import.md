# Product Image Batch Import

Use `npm run images:import` when a batch has mixed primary replacements, secondary gallery images, and product size variants.

The importer does not infer product families. Each image must map to one exact product by `productId`, `sku`, or an exact unambiguous `productName`. This keeps branded products separate: Dangote spaghetti images go only on the Dangote spaghetti product, and Dangote macaroni images go only on the Dangote macaroni product.

For unbranded products like rice, beans, and gari, put every representative image under that single product in the manifest. Variant sizes of one product can also stay in that product gallery.

## Rules

- `role: "primary"` appends the image and makes it the product's main image.
- `role: "gallery"` appends a secondary image.
- Only one primary image is allowed per product in one import.
- The script creates `thumb`, `card`, and `detail` WebP variants and saves the original.
- The database gallery order is controlled by `product_images.position`.
- The script defaults to dry-run. Nothing is uploaded unless `--commit` is passed.

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
