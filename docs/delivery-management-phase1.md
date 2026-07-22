# Meal05 Delivery Management Phase 1

Implemented scope:
- Role migration to `customer`, `rider`, `dispatcher`, `admin`, `super_admin`.
- Existing `public.users` remains the role/profile source of truth; `public.profiles` is a compatibility view.
- Existing `delivery_partners` is extended for rider/driver identity fields instead of replaced.
- Delivery routes, route stops, access tokens, audit logs, private proof-photo bucket, and future single-row rider location table.
- Dispatcher dashboard at `/dispatch`.
- Secure rider web portal at `/rider/route/{token}`.
- Customer-safe delivery API at `/api/customer/orders/{orderId}/delivery`.
- Transaction-safe route creation through `public.create_delivery_route_transaction`, called only by trusted server-side code.

Intentionally deferred:
- Live GPS tracking.
- Internal rider/customer chat.
- Automated rider payouts.
- Native rider app screens.
- Route optimization providers.

Access model:
- Admin workspace remains admin/super-admin only.
- Dispatch workspace allows dispatcher/admin/super-admin via `hasDispatchAccess`.
- Temporary rider links validate token hash, expiry, revocation, route assignment, route status, and optional PIN server-side.
- Riders never receive OTPs from the rider API.

Setup:
1. Run migration `supabase/migrations/20260722110000_delivery_management_phase1.sql`.
2. Run migration `supabase/migrations/20260722123000_delivery_route_creation_rpc.sql`.
3. Set `DELIVERY_SECURITY_SECRET` in production/staging. If omitted, the app falls back to existing server secrets, but an explicit secret is recommended.
4. Assign users with the Staff page or `/api/admin/assign-role`.
5. Ensure delivery partners have `full_name`, `phone`, `vehicle_type`, and `is_active = true`.
6. Open `/dispatch` as a dispatcher/admin.

Test checklist:
- Customer cannot open `/dispatch`.
- Rider cannot open `/dispatch`.
- Dispatcher can open `/dispatch` but not full admin-only areas.
- Dispatcher creates a grouped route from ready orders.
- Route creation sets first stop to `next`.
- Secure rider link requires PIN when generated with PIN.
- Expired/revoked/invalid token is rejected.
- Rider accepts route.
- Rider starts route.
- Rider opens Google Maps/WhatsApp/call links.
- Rider marks en route and arrived.
- Wrong OTP increments attempts and does not deliver.
- Correct OTP marks stop and order delivered.
- Final stop completion closes route.
- Proof photo uploads to private `delivery-proof-photos` bucket.
- Customer delivery endpoint only returns the authenticated customer’s own order.
- Audit logs are created for route creation, token generation/revocation, status changes, failed OTP, verified OTP, proof upload, and route completion.

Known phase-1 limitation:
- OTP plaintext is returned once in the dispatcher route-creation response as customer send/copy messages. The stop table stores only the hash. A production notification worker should send these messages to the customer immediately and avoid staff copying where possible.
- Route creation now runs inside a `SECURITY DEFINER` Postgres RPC with row locks on selected orders. It validates dispatcher/admin role, rejects duplicate active route assignment, stores OTP/token hashes, creates stops, updates order delivery status, creates the token record, and writes audit logs in one transaction.
- Proof-photo uploads are compressed client-side, capped by server-side size/dimension limits, verified by file signature, and stored in private storage paths generated server-side.
