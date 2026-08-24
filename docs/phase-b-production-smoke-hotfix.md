# Phase B Production Smoke Hotfix

Date: 2026-08-24

## Trigger

The first production smoke test after the Flexible Market rollout passed the four-product database/commerce checks but exposed three storefront issues:

1. Quick Add did not show Preferred-size controls.
2. The Irish Potato cart thumbnail was broken through the Next image optimisation route.
3. Placeholder customer review/rating presentation remained visible on product pages.

Phase C Request-product activation remains paused until this hotfix passes production smoke testing.

## Root cause and fix

### Quick Add

Some catalogue feeds can include preloaded variations and therefore set `optionsLoaded=true`, while their lightweight payload does not include the authoritative product-level Flexible metadata or all variant availability/inventory metadata. Quick Add trusts `optionsLoaded` and can skip `/api/products/:id`.

The shared catalogue client now marks catalogue products `optionsLoaded=false` before they reach storefront consumers. Quick Add can still render its card fallback immediately, but it must fetch the authoritative product endpoint before treating options as canonical.

### Cart/product images

The live Irish Potato catalogue has valid purpose-sized Supabase WebP assets, but the Cloudflare/OpenNext `/_next/image` optimisation hop returned 404 for the cart thumbnail. Product images are already normalised into thumb/card/detail WebP derivatives, so the Next runtime optimiser is disabled and those assets are served directly.

### Customer reviews

Product review presentation is launch-gated until Meal05 has a verified customer-review source. The product hero rating summary and Customer Reviews section are hidden, and aggregate-rating structured data is disabled so placeholder review values are not advertised to search engines.

## Safety

- No product selection model was changed.
- No availability or inventory modes were changed.
- No price, stock, variant, or product activation data was changed.
- The four Flexible + Standard products remain active.
- Request-mode activation remains paused pending the follow-up smoke test.
