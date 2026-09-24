import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { formatKgPerCongo, normalizeLocalMeasurementInfo } from "./local-measurement.js";

test("normalizes active product-linked Congo measurement profiles", () => {
  assert.deepEqual(
    normalizeLocalMeasurementInfo({
      product_id: 1044,
      profile: { display_name: "Imported Small Grain Rice", kg_per_congo: 1.73, is_active: true },
    }),
    { kgPerCongo: 1.73, displayName: "Imported Small Grain Rice" }
  );
});

test("hides missing, inactive, and invalid measurement profiles", () => {
  assert.equal(normalizeLocalMeasurementInfo(null), null);
  assert.equal(normalizeLocalMeasurementInfo({ profile: null }), null);
  assert.equal(normalizeLocalMeasurementInfo({ profile: { kg_per_congo: 1.35, is_active: false } }), null);
  assert.equal(normalizeLocalMeasurementInfo({ profile: { kg_per_congo: null, is_active: true } }), null);
});

test("formats confirmed measurements to the database precision", () => {
  assert.equal(formatKgPerCongo(1.35), "1.350");
  assert.equal(formatKgPerCongo(1.73), "1.730");
  assert.equal(formatKgPerCongo(null), "");
});

test("storefront purchase paths use the shared database-backed measurement component", () => {
  const detail = readFileSync(resolve(process.cwd(), "src/components/product-detail-client.js"), "utf8");
  const quickAdd = readFileSync(resolve(process.cwd(), "src/components/quick-add-drawer.js"), "utf8");
  const server = readFileSync(resolve(process.cwd(), "src/lib/local-measurement-server.js"), "utf8");
  const component = readFileSync(resolve(process.cwd(), "src/components/local-measurement-info.js"), "utf8");

  assert.match(detail, /<LocalMeasurementInfo measurementInfo=\{product\?\.measurementInfo\}/);
  assert.match(quickAdd, /<LocalMeasurementInfo measurementInfo=\{displayProduct\?\.measurementInfo\} compact/);
  assert.match(server, /from\("product_measurement_settings"\)/);
  assert.match(server, /local_measurement_profiles\(display_name, kg_per_congo, is_active\)/);
  assert.match(component, /1 kg ≠ 1 Congo/);
  assert.match(component, /1 Congo ≈ \{kgPerCongo\} kg/);
  assert.doesNotMatch(component, /\b(?:881|1044|1\.350|1\.730)\b/);
});
