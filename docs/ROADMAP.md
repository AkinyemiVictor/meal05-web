# Meal05 product roadmap

Updated: 2 July 2026

## Implemented

- Public landing page, live categories, popular-product preview, waitlist and legal pages.
- Akala Express launch hub at `7.342134, 3.847802` with a 5 km server-authoritative radius.
- Location capture through device GPS or manual area search, followed by a draggable exact pin.
- OpenStreetMap/Leaflet map display and Photon submitted-search/reverse-label fallback; no Google billing dependency.
- Location persisted in the browser, displayed in the header and revalidated by the order API.
- Fulfilment-first checkout: prepaid pickup or prepaid delivery.
- Multi-partner delivery schema with active/draft status, per-zone services, quote ranking and recommended partner support.
- Delivery quote snapshots and separate customer fee, partner cost and Meal05 subsidy accounting.
- No fictional or unconfirmed delivery partners displayed.

## Launch configuration required

- Confirm and activate at least one delivery partner and add its logo, service fee, ETA and launch-zone service row.
- Confirm pickup opening hours, collection instructions and operational contact details.
- Apply any repository migrations not yet recorded by the hosted Supabase migration history.
- Test GPS permission denial, manual pin placement, inside/outside-radius results and mobile checkout.

## Next

- Admin UI for delivery partners, services, ranking and recommendation controls.
- Persist validated coordinates and provider labels to customer saved addresses.
- Send out-of-zone coordinates and requested address into the waitlist expansion dataset.
- Add partner API quoting/tracking adapters when a carrier supports them.
- Move public OSM tiles and Photon search to a contracted/self-hosted provider if launch traffic or provider policy requires it.
- Add polygon zones and different per-area rules only after operational evidence shows the 5 km radius is insufficient.

## Location-provider decision

The launch map uses Leaflet with OpenStreetMap tiles. Search is deliberately submit-based rather than continuous autocomplete because the public Photon service may throttle extensive usage. The exact coordinate, not the address label, is the source of truth. Provider access is isolated behind the location component and `/api/location/geocode`, so a later Google, Mapbox or contracted OSM provider does not change delivery-zone or checkout logic.
