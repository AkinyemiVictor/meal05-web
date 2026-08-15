import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCustomerRiderContact,
  buildRiderCustomerContact,
  canShowCustomerRiderContact,
  canShowRiderCustomerContact,
} from "./contact-window.js";

const activeRoute = {
  id: "route-1",
  status: "in_progress",
  actual_start_time: "2026-07-28T10:00:00.000Z",
  delivery_partners: {
    full_name: "Ayo Rider",
    phone: "08030000000",
    rider_code: "M05-004",
    vehicle_type: "motorcycle",
    vehicle_plate_number: "ABC-123XY",
  },
};

const activeStop = {
  id: "stop-1",
  order_id: 25,
  status: "en_route",
  customer_name: "Tola Customer",
  customer_phone: "08118287047",
  orders: { order_reference: "M05-25" },
  delivery_routes: activeRoute,
};

test("rider contact opens only for active started route stops", () => {
  assert.equal(canShowRiderCustomerContact({ route: activeRoute, stop: activeStop }), true);
  assert.equal(canShowRiderCustomerContact({ route: { ...activeRoute, status: "assigned", actual_start_time: null }, stop: activeStop }), false);
  assert.equal(canShowRiderCustomerContact({ route: activeRoute, stop: { ...activeStop, status: "delivered" } }), false);
  assert.equal(canShowRiderCustomerContact({ route: { ...activeRoute, status: "completed" }, stop: activeStop }), false);
});

test("rider contact payload hides invalid customer phones and includes delivery-only note", () => {
  const contact = buildRiderCustomerContact({ route: activeRoute, stop: activeStop });
  assert.equal(contact.available, true);
  assert.equal(contact.phone, "0811 828 7047");
  assert.match(contact.whatsappUrl, /Meal05%20rider%20delivering%20order/);
  assert.match(contact.note, /delivery coordination/i);

  const unavailable = buildRiderCustomerContact({ route: activeRoute, stop: { ...activeStop, customer_phone: "Not set" } });
  assert.equal(unavailable.available, false);
});

test("customer rider contact is unavailable before the order is out for delivery", () => {
  const processing = { id: 25, order_reference: "M05-25", status: "processing", delivery_status: "packed" };
  assert.equal(canShowCustomerRiderContact({ order: processing, route: activeRoute, stop: activeStop }), false);
  assert.equal(buildCustomerRiderContact({ order: processing, stop: activeStop }).available, false);
});

test("customer rider contact is available only for live delivery windows", () => {
  const order = { id: 25, order_reference: "M05-25", status: "processing", delivery_status: "out_for_delivery" };
  const contact = buildCustomerRiderContact({ order, stop: activeStop });
  assert.equal(contact.available, true);
  assert.equal(contact.rider.name, "Ayo R.");
  assert.equal(contact.rider.phone, "0803 000 0000");
  assert.equal(contact.rider.riderCode, "M05-004");
  assert.equal(contact.rider.vehicleType, "motorcycle");
  assert.match(contact.rider.whatsappUrl, /Meal05%20order%20%23M05-25/);
  assert.match(contact.note, /payment, refund, product or complaint/i);

  assert.equal(buildCustomerRiderContact({ order, stop: { ...activeStop, status: "failed" } }).available, false);
  assert.equal(
    buildCustomerRiderContact({
      order,
      stop: { ...activeStop, delivery_routes: { ...activeRoute, delivery_partners: { ...activeRoute.delivery_partners, phone: "" } } },
    }).available,
    false,
  );
});

test("customer delivery contact API verifies ownership before returning rider data", () => {
  const source = readFileSync(new URL("../../app/api/orders/[orderId]/delivery-contact/route.js", import.meta.url), "utf8");
  assert.match(source, /\.eq\("id", id\)/);
  assert.match(source, /\.eq\("user_id", auth\.user\.id\)/);
  assert.doesNotMatch(source, /delivery_otp_hash|token_hash|pin_hash/);
  assert.match(source, /withNoStore/);
});

test("customer order UI no longer exposes manual delivery completion", () => {
  const accountPage = readFileSync(new URL("../../app/account/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(accountPage, /Mark as delivered/);
  assert.doesNotMatch(accountPage, /handleMarkOrderDelivered/);
  assert.doesNotMatch(accountPage, /updateUserOrderStatus/);
  assert.match(accountPage, /delivery-contact/);
});

test("footer and rider entry point expose portal without token storage or route lists", () => {
  const footer = readFileSync(new URL("../../components/footer.js", import.meta.url), "utf8");
  const riderEntry = readFileSync(new URL("../../components/rider-portal-entry.js", import.meta.url), "utf8");
  assert.match(footer, /href="\/rider"/);
  assert.match(footer, /Rider Portal/);
  assert.match(riderEntry, /url\.origin !== window\.location\.origin/);
  assert.doesNotMatch(riderEntry, /localStorage|sessionStorage/);
});
