import fs from "node:fs";

const dataPath = "src/lib/admin-dashboard-data.js";
const pagePath = "src/app/admin/(secure)/orders/page.js";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content);

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count === 0) {
    if (source.includes(after)) return source;
    throw new Error(`Missing transform target: ${label}`);
  }
  if (count !== 1) throw new Error(`Expected one transform target for ${label}, found ${count}`);
  return source.replace(before, after);
};

let data = read(dataPath);

const canonicalSelect = '  "id, user_id, total, subtotal, packaging_fee, delivery_fee, discount_total, promo_code, status, payment_status, payment_method, payment_reference, delivery_status, delivery_address, created_at, updated_at",\n';
if (!data.includes(`const ORDER_SELECT_CANDIDATES = [\n${canonicalSelect}`)) {
  data = replaceOnce(
    data,
    "const ORDER_SELECT_CANDIDATES = [\n",
    `const ORDER_SELECT_CANDIDATES = [\n${canonicalSelect}`,
    "canonical live order select"
  );
}

data = replaceOnce(
  data,
  "    unitPrice: toNumber(row?.unit_price),\n    lineTotal: toNumber(row?.quantity) * toNumber(row?.unit_price),\n    imageUrl: product?.image_url || row?.image_url || \"\",\n",
  "    unitPrice: toNumber(row?.unit_price ?? row?.price),\n    lineTotal: toNumber(row?.quantity) * toNumber(row?.unit_price ?? row?.price),\n    sizePreference: String(row?.size_preference || \"\").trim().toLowerCase(),\n    sizePreferenceLabel: ({ best_available: \"Best available\", smaller: \"Smaller pieces\", medium: \"Medium pieces\", larger: \"Larger pieces\" })[String(row?.size_preference || \"\").trim().toLowerCase()] || \"\",\n    fulfillmentNote: String(row?.fulfillment_note || \"\").trim(),\n    imageUrl: product?.image_url || row?.image_url || \"\",\n",
  "live order item price and size preference mapping"
);

data = replaceOnce(
  data,
  "  const itemSelectCandidates = [\n    \"id, order_id, product_id, variant_id, quantity, unit_price, products(name, unit, image_url)\",\n",
  "  const itemSelectCandidates = [\n    \"id, order_id, product_id, variant_id, quantity, price, size_preference, fulfillment_note, products(name, unit, image_url)\",\n    \"id, order_id, product_id, quantity, price, size_preference, fulfillment_note, products(name, unit, image_url)\",\n    \"id, order_id, product_id, variant_id, quantity, price, size_preference, fulfillment_note\",\n    \"id, order_id, product_id, quantity, price, size_preference, fulfillment_note\",\n    \"id, order_id, product_id, variant_id, quantity, unit_price, products(name, unit, image_url)\",\n",
  "canonical live order item selectors"
);

write(dataPath, data);

let page = read(pagePath);
page = replaceOnce(
  page,
  "                          <p style={{ margin: \"4px 0 0\", color: \"#64748b\", fontSize: 12 }}>\n                            Product ID: {item.productId || \"-\"}{item.variantId ? ` | Variant ID: ${item.variantId}` : \"\"}{item.unit ? ` | ${item.unit}` : \"\"}\n                          </p>\n",
  "                          <p style={{ margin: \"4px 0 0\", color: \"#64748b\", fontSize: 12 }}>\n                            Product ID: {item.productId || \"-\"}{item.variantId ? ` | Variant ID: ${item.variantId}` : \"\"}{item.unit ? ` | ${item.unit}` : \"\"}\n                          </p>\n                          {item.sizePreferenceLabel ? (\n                            <p style={{ margin: \"6px 0 0\", color: \"#0f172a\", fontSize: 12 }}>\n                              Fulfilment size preference: <strong>{item.sizePreferenceLabel}</strong>\n                            </p>\n                          ) : null}\n                          {item.fulfillmentNote ? (\n                            <p style={{ margin: \"4px 0 0\", color: \"#475569\", fontSize: 12 }}>\n                              Fulfilment note: {item.fulfillmentNote}\n                            </p>\n                          ) : null}\n",
  "admin fulfilment size preference display"
);
write(pagePath, page);

console.log("Admin order history hotfix transform applied.");
