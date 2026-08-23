import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const helper = readFileSync(resolve(process.cwd(), "src/lib/availability-reengagement-server.js"), "utf8");
const adminRoute = readFileSync(resolve(process.cwd(), "src/app/api/admin/availability-requests/[id]/route.js"), "utf8");
const actionRoute = readFileSync(resolve(process.cwd(), "src/app/api/availability-requests/[id]/actions/route.js"), "utf8");
const notificationClient = readFileSync(resolve(process.cwd(), "src/lib/availability-notifications-client.js"), "utf8");
const notificationPage = readFileSync(resolve(process.cwd(), "src/app/notifications/page.js"), "utf8");
const audit = readFileSync(resolve(process.cwd(), "docs/flexible-availability-catalogue-audit-2026-08-23.md"), "utf8");

test("availability re-engagement sends only supported actionable events with direct request links", () => {
  assert.match(helper, /availability_request_confirmed/);
  assert.match(helper, /availability_request_action_required/);
  assert.match(helper, /\/availability-requests\/\$\{encodeURIComponent\(request\.id\)\}/);
  assert.match(helper, /sendTransactionalEmail/);
  assert.doesNotMatch(helper, /twilio|whatsapp.*send|sendWhatsApp/i);
});

test("re-engagement is best effort and records delivery outcomes instead of rolling back request state", () => {
  assert.match(helper, /provider_disabled/);
  assert.match(helper, /recipient_missing/);
  assert.match(helper, /status: "failed"/);
  assert.match(helper, /console\.warn\("Failed to process availability email re-engagement"/);
  assert.match(helper, /channel: "in_app"/);
  assert.match(helper, /channel: "email"/);
});

test("admin availability resolution re-engages on confirmed or action-required state", () => {
  assert.match(adminRoute, /sendAvailabilityReengagement/);
  assert.match(adminRoute, /status === "confirmed" \|\| status === "action_required"/);
  assert.doesNotMatch(adminRoute, /await admin\.from\("notifications"\)\.insert/);
});

test("customer removal path re-engages when the remaining basket becomes payable", () => {
  assert.match(actionRoute, /sendAvailabilityReengagement/);
  assert.match(actionRoute, /if \(confirmed\) \{/);
  assert.match(actionRoute, /paymentWindowMinutes: availabilitySettings\.paymentWindowMinutes/);
});

test("notification center derives direct actionable availability links without storefront-wide polling", () => {
  assert.match(notificationClient, /action_required/);
  assert.match(notificationClient, /ready_for_payment/);
  assert.match(notificationClient, /href: `\/availability-requests\/\$\{request\.id\}`/);
  assert.match(notificationPage, /fetch\("\/api\/availability-requests"/);
  assert.match(notificationPage, /window\.setInterval\(refresh, 60000\)/);
  assert.doesNotMatch(notificationPage, /setInterval\([^,]+,\s*[0-9]{1,4}\)/);
});

test("catalogue audit remains non-destructive and separates flexible selection from availability confidence", () => {
  assert.match(audit, /No product, variant, availability mode, inventory mode, price, stock value, or active\/inactive flag was changed/);
  assert.match(audit, /Irish Potato \| 603/);
  assert.match(audit, /Sweet Potato \| 602/);
  assert.match(audit, /Light Red Onions \| 117/);
  assert.match(audit, /Red Onions \| 1004/);
  assert.match(audit, /zero stock value is an \*\*operations-review signal\*\*/);
  assert.match(audit, /Do not use zero `stock_count` alone/);
});
