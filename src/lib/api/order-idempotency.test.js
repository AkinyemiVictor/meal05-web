import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderRequestFingerprint,
  checkExistingOrderIdempotency,
  classifyExistingIdempotencyRecord,
  completeOrderIdempotencyKey,
  reserveOrderIdempotencyKey,
} from "./order-idempotency.js";

const createMemoryAdmin = () => {
  const rows = [];
  let nextId = 1;

  const applyFilters = (filters) =>
    rows.filter((row) => filters.every(({ column, value }) => row[column] === value));

  const createBuilder = () => {
    const state = {
      filters: [],
      insertPayload: null,
      updatePayload: null,
      mode: "select",
    };
    const builder = {
      insert(payload) {
        state.mode = "insert";
        state.insertPayload = payload;
        return builder;
      },
      select() {
        return builder;
      },
      update(payload) {
        state.mode = "update";
        state.updatePayload = payload;
        return builder;
      },
      delete() {
        state.mode = "delete";
        return builder;
      },
      eq(column, value) {
        state.filters.push({ column, value });
        return builder;
      },
      async maybeSingle() {
        const data = applyFilters(state.filters)[0] || null;
        return { data, error: null };
      },
      async single() {
        if (state.mode === "insert") {
          const exists = rows.some(
            (row) =>
              row.user_id === state.insertPayload.user_id &&
              row.idempotency_key === state.insertPayload.idempotency_key,
          );
          if (exists) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          const row = { id: nextId++, ...state.insertPayload };
          rows.push(row);
          return { data: row, error: null };
        }
        if (state.mode === "update") {
          const row = applyFilters(state.filters)[0] || null;
          if (!row) return { data: null, error: { message: "No row found" } };
          Object.assign(row, state.updatePayload);
          return { data: row, error: null };
        }
        return { data: applyFilters(state.filters)[0] || null, error: null };
      },
      then(resolve) {
        if (state.mode === "update") {
          const row = applyFilters(state.filters)[0] || null;
          if (row) Object.assign(row, state.updatePayload);
          return Promise.resolve({ data: row ? [row] : [], error: null }).then(resolve);
        }
        if (state.mode === "delete") {
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (state.filters.every(({ column, value }) => rows[index][column] === value)) {
              rows.splice(index, 1);
            }
          }
          return Promise.resolve({ error: null }).then(resolve);
        }
        return Promise.resolve({ data: applyFilters(state.filters), error: null }).then(resolve);
      },
    };
    return builder;
  };

  return {
    rows,
    from(table) {
      assert.equal(table, "order_idempotency_keys");
      return createBuilder();
    },
  };
};

const basePayload = {
  deliveryContactName: "Test Customer",
  deliveryContactPhone: "08000000000",
  fulfillmentType: "pickup",
  pickupLocationId: 1,
  paymentMethod: "paystack",
  items: [{ product_id: "10", variant_id: "20", quantity: 1, unit_price_at_add: 1500 }],
};

test("same user and same key can replay the stored order response", async () => {
  const admin = createMemoryAdmin();
  const fingerprint = buildOrderRequestFingerprint(basePayload);
  const reserved = await reserveOrderIdempotencyKey(admin, { userId: "user-a", key: "key-1", fingerprint });
  assert.equal(reserved.kind, "reserved");

  const responseBody = { order: { id: 101 }, summary: { deliveryFee: 0 }, items: [{ variant_id: 20 }] };
  await completeOrderIdempotencyKey(admin, {
    recordId: reserved.record.id,
    orderId: 101,
    responseStatus: 201,
    responseBody,
  });

  const replay = await checkExistingOrderIdempotency(admin, { userId: "user-a", key: "key-1", fingerprint });
  assert.equal(replay.kind, "replay");
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, responseBody);
});

test("same user, same key, and different payload returns conflict", () => {
  const first = buildOrderRequestFingerprint(basePayload);
  const second = buildOrderRequestFingerprint({ ...basePayload, pickupLocationId: 2 });
  const result = classifyExistingIdempotencyRecord({ request_fingerprint: first, status: "completed" }, second);
  assert.equal(result.kind, "conflict");
  assert.equal(result.status, 409);
});

test("processing keys block a second order creation", async () => {
  const admin = createMemoryAdmin();
  const fingerprint = buildOrderRequestFingerprint(basePayload);
  const first = await reserveOrderIdempotencyKey(admin, { userId: "user-a", key: "key-processing", fingerprint });
  const second = await reserveOrderIdempotencyKey(admin, { userId: "user-a", key: "key-processing", fingerprint });
  assert.equal(first.kind, "reserved");
  assert.equal(second.kind, "processing");
  assert.equal(second.status, 409);
});

test("concurrent reservations with the same key create one reservation", async () => {
  const admin = createMemoryAdmin();
  const fingerprint = buildOrderRequestFingerprint(basePayload);
  const results = await Promise.all([
    reserveOrderIdempotencyKey(admin, { userId: "user-a", key: "key-concurrent", fingerprint }),
    reserveOrderIdempotencyKey(admin, { userId: "user-a", key: "key-concurrent", fingerprint }),
  ]);
  assert.equal(results.filter((result) => result.kind === "reserved").length, 1);
  assert.equal(results.filter((result) => result.kind === "processing").length, 1);
  assert.equal(admin.rows.length, 1);
});

test("different users may use the same idempotency key independently", async () => {
  const admin = createMemoryAdmin();
  const fingerprint = buildOrderRequestFingerprint(basePayload);
  const first = await reserveOrderIdempotencyKey(admin, { userId: "user-a", key: "shared-key", fingerprint });
  const second = await reserveOrderIdempotencyKey(admin, { userId: "user-b", key: "shared-key", fingerprint });
  assert.equal(first.kind, "reserved");
  assert.equal(second.kind, "reserved");
  assert.equal(admin.rows.length, 2);
});

test("unit_price_at_add is not part of the idempotency fingerprint", () => {
  const withSnapshot = buildOrderRequestFingerprint(basePayload);
  const withoutSnapshot = buildOrderRequestFingerprint({
    ...basePayload,
    items: [{ product_id: "10", variant_id: "20", quantity: 1 }],
  });
  assert.equal(withSnapshot, withoutSnapshot);
});

test("delivery replay preserves the stored dispatch result", () => {
  const responseBody = {
    order: { id: 202, fulfillment_type: "delivery" },
    summary: {
      deliveryFee: 1200,
      dispatchPartner: { id: "partner-1", name: "Dispatch One", fee: 1200 },
    },
  };
  const result = classifyExistingIdempotencyRecord(
    {
      request_fingerprint: "fingerprint",
      response_body: responseBody,
      response_status: 201,
      status: "completed",
    },
    "fingerprint",
  );
  assert.equal(result.kind, "replay");
  assert.deepEqual(result.body.summary.dispatchPartner, responseBody.summary.dispatchPartner);
  assert.equal(result.body.summary.deliveryFee, 1200);
});
