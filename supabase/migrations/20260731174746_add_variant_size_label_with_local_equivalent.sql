alter table public.product_variants
  add column if not exists size_label text
  generated always as (
    case
      when local_measurement_equivalent is not null then
        coalesce(nullif(btrim(size), ''), nullif(btrim(name), ''), 'Option')
        || ' (≈ '
        || btrim(local_measurement_equivalent)
        || ')'
      else
        coalesce(nullif(btrim(size), ''), nullif(btrim(name), ''), 'Option')
    end
  ) stored;

comment on column public.product_variants.size_label is
  'Generated customer-facing variant label combining the official size with the optional local measurement equivalent.';;
