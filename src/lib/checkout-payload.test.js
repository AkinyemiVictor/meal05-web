import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCheckoutOrderItems,
  buildCheckoutOrderRequest,
  getCheckoutApiErrorMessage,
  normalizeDeliveryAddress,
} from "./checkout-payload.js";

const cartRow = {
  id: 81,
  quantity: 7,
  product_id: "product-bananas",
  variant_id: "variant-omini",
  unit_price_at_add: 1000,
  variant_name: "Omini",
  product_name: "Small Bananas (Omini)",
  image_url: "/images/bananas.png",
  unit: "bunch",
};

test("normalizes string and saved-object delivery addresses", () => {
  assert.equal(normalizeDeliveryAddress("  12 Akala Express  "), "12 Akala Express");
  assert.equal(normalizeDeliveryAddress({ line: "  7 Elebu Road " }), "7 Elebu Road");
  assert.equal(normalizeDeliveryAddress({ formattedAddress: "  4 Oluyole Estate " }), "4 Oluyole Estate");
  assert.equal(normalizeDeliveryAddress(null), "");
});

test("builds order items from the API cart shape without null identifiers", () => {
  assert.deepEqual(buildCheckoutOrderItems([cartRow]), [{
    product_id: "product-bananas",
    variant_id: "variant-omini",
    quantity: 7,
    unit_price_at_add: 1000,
    variant_name: "Omini",
    product_name: "Small Bananas (Omini)",
  }]);
});

test("builds the final order request with a normalized address and canonical cart metadata", () => {
  const payload = buildCheckoutOrderRequest({
    form: {
      fullName: "Ada Customer",
      phone: "08012345678",
      address: { address: " 12 Akala Express " },
      houseNumber: "12",
      landmark: "Near the gate",
      addressLabel: "Home",
      city: "Ibadan",
      notes: "Call on arrival",
    },
    items: [cartRow],
    fulfillmentType: "delivery",
    deliveryPartnerId: "5f82ce80-6513-4a64-86f8-9f43cd60a975",
    deliveryLatitude: 7.3775,
    deliveryLongitude: 3.947,
    paymentMethod: "wallet",
    promoCode: "SAVE5",
  });

  assert.equal(payload.deliveryAddress, "12 Akala Express");
  assert.equal(payload.deliveryStreet, "12 Akala Express");
  assert.equal(payload.paymentMethod, "wallet");
  assert.equal(payload.items[0].variant_id, "variant-omini");
  assert.equal(Object.values(payload.items[0]).includes(null), false);
});

test("turns API validation, wallet, stock, auth, and gateway failures into useful messages", () => {
  assert.equal(
    getCheckoutApiErrorMessage({ error: "Validation failed", issues: [{ path: ["deliveryAddress"], message: "Expected string" }] }),
    "Please select a valid delivery address."
  );
  assert.equal(
    getCheckoutApiErrorMessage({ error: "Validation failed", issues: [{ path: ["items", 0, "variant_id"], message: "Invalid input" }] }),
    "One of the selected items is no longer valid. Please review your cart."
  );
  assert.equal(
    getCheckoutApiErrorMessage({ error: "Insufficient wallet balance" }),
    "Payment unsuccessful. Insufficient wallet balance."
  );
  assert.equal(
    getCheckoutApiErrorMessage({ error: "Product is out of stock" }),
    "One of the selected items is no longer available. Please review your cart."
  );
  assert.equal(
    getCheckoutApiErrorMessage({ error: "Not authenticated" }),
    "Your login session has expired. Please sign in again to continue checkout."
  );
  assert.equal(
    getCheckoutApiErrorMessage({ error: "This payment method is currently unavailable.", code: "PAYMENT_METHOD_DISABLED" }),
    "Payment could not be initialized. Please choose another option or try again."
  );
});

