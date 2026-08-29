import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  clearManualTransferConfirmation,
  persistManualTransferConfirmation,
  readManualTransferConfirmation,
} from "./manual-transfer-confirmation-storage.js";

const values = new Map();

beforeEach(() => {
  values.clear();
  global.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    },
  };
});

afterEach(() => {
  delete global.window;
});

test("manual transfer confirmation context is normalized and session-scoped", () => {
  assert.equal(persistManualTransferConfirmation({
    providerCode: " moniepoint_transfer ",
    paymentId: " payment-123 ",
    amount: "4195",
    currency: "ngn",
    orderId: 42,
    defaultPayerAccountName: " Victor Akinyemi ",
  }), true);

  assert.deepEqual(readManualTransferConfirmation(), {
    providerCode: "moniepoint_transfer",
    paymentId: "payment-123",
    amount: 4195,
    currency: "NGN",
    orderId: "42",
    defaultPayerAccountName: "Victor Akinyemi",
  });

  clearManualTransferConfirmation();
  assert.equal(readManualTransferConfirmation(), null);
});

test("invalid confirmation contexts are rejected", () => {
  assert.equal(persistManualTransferConfirmation({ providerCode: "moniepoint_transfer", amount: 4195 }), false);
  assert.equal(persistManualTransferConfirmation({ providerCode: "moniepoint_transfer", paymentId: "pay-1", amount: 0 }), false);
  assert.equal(readManualTransferConfirmation(), null);
});
