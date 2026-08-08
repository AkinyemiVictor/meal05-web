import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeCartItem, normalizeCartItems } from "./cart-items.js";

const apiCartRow = {
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

test("normalizes authenticated API cart metadata without treating the cart row id as a product", () => {
  const item = normalizeCartItem(apiCartRow);

  assert.equal(item.id, "variant-omini");
  assert.equal(item.cartItemId, 81);
  assert.equal(item.productId, "product-bananas");
  assert.equal(item.variantId, "variant-omini");
  assert.equal(item.name, "Small Bananas (Omini)");
  assert.equal(item.variantName, "Omini");
  assert.equal(item.image, "/images/bananas.png");
  assert.equal(item.unit, "bunch");
  assert.equal(item.price, 1000);
  assert.equal(item.quantity, 7);
  assert.equal(item.lineTotal, 7000);
});

test("prefers variant and nested product images while retaining the real product name", () => {
  const [item] = normalizeCartItems([{
    ...apiCartRow,
    image_url: "/images/legacy.png",
    variant_image_url: "/images/omini.png",
    products: { name: "Small Bananas", image_url: "/images/product.png" },
  }]);

  assert.equal(item.name, "Small Bananas (Omini)");
  assert.equal(item.image, "/images/omini.png");
  assert.notEqual(item.name, "Fresh produce");
});

