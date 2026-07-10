# Supabase database history

The migration directory currently contains 36 files:

- The first 28 files, ending at `20260630100519`, are exact exports of the
  migration history recorded as applied by the live Meal05 Supabase project on
  2026-06-30.
- The 8 later files are the post-export history currently represented in the
  repository:
  - `20260630152127_harden_default_market_id_search_path.sql`
  - `20260630163739_atomic_paystack_payment_and_stock.sql`
  - `20260701220034_add_zone_geometry_and_resolver.sql`
  - `20260701225820_radius_delivery_zone_core.sql`
  - `20260701230711_delivery_partners_and_quotes.sql`
  - `20260702120000_dispatch_ready_addresses.sql`
  - `20260705143244_product_images_gallery_constraints.sql`
  - `20260709103000_add_orders_packaging_fee.sql`

They are historical deltas from the database structure that existed before
2026-06-24. They are not a from-zero schema build: several early migrations
alter, document, snapshot, or remove objects that already existed.

## Safety rules

- Do not run `supabase db reset` against an empty database using these files
  alone. It will fail because the pre-2026-06-24 baseline is not present.
- Do not edit the first 28 exported migrations. Future database changes must be
  new, timestamped migration files after the latest file already in
  `migrations/`.
- Do not restore the removed local-only migrations
  `202606160001_admin_logs_schema.sql` or
  `202606170001_product_category_slugs.sql`; their effects already exist in the
  live schema and are represented by the reconciled history.
- The current public schema export is stored at
  `baseline/20260630_public_schema.sql`. Use it only through a documented
  staging bootstrap or controlled squash process. Do not move this
  current-state baseline into active migrations before these deltas without
  also reconciling remote migration metadata.

## Remote verification

After installing and authenticating the Supabase CLI:

```bash
npx supabase link --project-ref dzkrcmyupeerlbhshwgd
npx supabase migration list
```

All exported history versions should appear as applied locally and remotely
before running `npx supabase db push` or adding another live migration.

## Reconciliation workflow

Use this when local files, remote schema, and remote migration metadata are not
obviously aligned.

1. Link the repository to the live project and inspect both histories:

   ```bash
   npx supabase link --project-ref dzkrcmyupeerlbhshwgd
   npx supabase migration list
   ```

2. If a repository migration already exists in the live schema but is missing
   from `supabase_migrations.schema_migrations`, repair the remote history
   without re-running the SQL:

   ```bash
   npx supabase migration repair --status applied <version>
   ```

3. If the live database contains dashboard or hotfix drift that is not captured
   in the repository, pull it into a disposable migration for review:

   ```bash
   npx supabase db pull <descriptive_name>
   ```

   Do not merge the generated file blindly. Either:
   - convert the intentional change into a clean new migration, or
   - revert the live-only drift before the next push.

4. Only after history and schema are aligned, apply new repository migrations:

   ```bash
   npx supabase db push
   npx supabase migration list
   ```

5. If you need a from-zero bootstrap for staging or a fresh project, use the
   current-state baseline under `baseline/` only as part of a separate,
   documented squash/bootstrap process. Do not insert that baseline into the
   active `migrations/` chain ahead of the exported history.
