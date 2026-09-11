import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTagCartMetadata,
  getCartProcurementConflict,
  getTagBatchForVariant,
  normalizeProcurementMode,
  normalizeTagPurchaseMode,
} from "./tag-buy.js";
import { isAPlusTagBuyOption } from "./tag-buy-eligibility.js";

test("procurement mode defaults safely to standard", () => {
  assert.equal(normalizeProcurementMode("tag"), "tag");
  assert.equal(normalizeProcurementMode("anything-else"), "standard");
});

test("shopper purchase mode defaults to dual and preserves explicit Tag-only batches", () => {
  assert.equal(normalizeTagPurchaseMode(), "dual");
  assert.equal(normalizeTagPurchaseMode("tag_only"), "tag_only");
});

test("Tag batches only apply to their exact product option", () => {
  const batch = { id: "batch-a", variantId: "1004" };
  const product = { variantId: "1003", tagBatch: batch };
  assert.equal(getTagBatchForVariant(product, { variationId: 1003 }), null);
  assert.equal(getTagBatchForVariant(product, { variationId: 1004, tagBatch: batch }), batch);
});

test("initial A+ allow-list excludes single eggs and existing bulk options", () => {
  assert.equal(isAPlusTagBuyOption({ productSku: "CHICKEN-EGGS-MEDIUM", name: "1 Pack (6 Pieces)" }), true);
  assert.equal(isAPlusTagBuyOption({ productSku: "CHICKEN-EGGS-MEDIUM", name: "1 Piece" }), false);
  assert.equal(isAPlusTagBuyOption({ productSku: "SWEET-POTATO-100KG", name: "1 Paint Bucket (3.5kg)" }), true);
  assert.equal(isAPlusTagBuyOption({ productSku: "SWEET-POTATO-100KG", name: "1 Bag (100kg)" }), false);
  assert.equal(isAPlusTagBuyOption({ productSku: "MAIDUGURI-HONEY-BEANS-OLOYIN-50KG", name: "1kg" }), true);
  assert.equal(isAPlusTagBuyOption({ productSku: "COCONUT", name: "1 Piece" }), false);
});

test("standard and Tag Buy lines require separate carts", () => {
  assert.match(getCartProcurementConflict([{ procurement_mode: "standard" }], { procurement_mode: "tag", tag_batch_id: "batch-a" }), /standard items/i);
  assert.match(getCartProcurementConflict([{ procurement_mode: "tag", tag_batch_id: "batch-a" }], { procurement_mode: "standard" }), /Tag Buy/i);
});

test("a Tag Buy cart accepts only its current batch", () => {
  const cart = [{ procurement_mode: "tag", tag_batch_id: "batch-a" }];
  assert.equal(getCartProcurementConflict(cart, { procurement_mode: "tag", tag_batch_id: "batch-a" }), null);
  assert.match(getCartProcurementConflict(cart, { procurement_mode: "tag", tag_batch_id: "batch-b" }), /one Tag Buy/i);
});

test("Tag cart metadata snapshots its identity, price, and timing", () => {
  assert.deepEqual(buildTagCartMetadata({ id: "batch-a", tagPrice: 900, closesAt: "2026-09-12T12:00:00Z", expectedProcurementAt: "2026-09-13T12:00:00Z" }), {
    procurementMode: "tag",
    procurement_mode: "tag",
    tagBatchId: "batch-a",
    tag_batch_id: "batch-a",
    tagPriceAtAdd: 900,
    tag_price_at_add: 900,
    tagClosesAt: "2026-09-12T12:00:00Z",
    tag_closes_at: "2026-09-12T12:00:00Z",
    expectedProcurementAt: "2026-09-13T12:00:00Z",
    expected_procurement_at: "2026-09-13T12:00:00Z",
  });
});
