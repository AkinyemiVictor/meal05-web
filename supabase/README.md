# Supabase database history

The 28 files in `migrations/` are exact exports of the migrations recorded as
applied by the live Meal05 Supabase project on 2026-06-30.

They are historical deltas from the database structure that existed before
2026-06-24. They are not a from-zero schema build: several early migrations
alter, document, snapshot, or remove objects that already existed.

## Safety rules

- Do not run `supabase db reset` against an empty database using these files
  alone. It will fail because the pre-2026-06-24 baseline is not present.
- Do not edit the 28 exported migrations. Future database changes must be new,
  timestamped migration files after `20260630100519`.
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
supabase link --project-ref dzkrcmyupeerlbhshwgd
supabase migration list
```

All 28 migration versions should appear as applied locally and remotely before
running `supabase db push` or adding another live migration.
