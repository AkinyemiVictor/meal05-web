import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/quick-add-drawer.js"), "utf8");

test("quick add persists flexible preference and availability metadata", () => {
  assert.match(source, /selectionModel,/);
  assert.match(source, /selection_model:\s*selectionModel/);
  assert.match(source, /availabilityMode,/);
  assert.match(source, /availability_mode:\s*availabilityMode/);
  assert.match(source, /inventoryTrackingMode,/);
  assert.match(source, /inventory_tracking_mode:\s*inventoryTrackingMode/);
  assert.match(source, /sizePreference:\s*normalizedSizePreference/);
  assert.match(source, /size_preference:\s*normalizedSizePreference/);
  assert.match(source, /variationNote,/);
});

test("quick add keeps flexible size preference independent from commercial variant price", () => {
  assert.match(source, /const \[sizePreference, setSizePreference\] = useState\("best_available"\)/);
  assert.match(source, /normalizeSizePreference\(sizePreference, SELECTION_MODE_FLEXIBLE\)/);
  assert.match(source, /<SizePreferencePicker/);
  assert.match(source, /className="quick-add-mobile-size-preference"[\s\S]*select value=\{sizePreference\}/);
  assert.match(source, /onChange=\{\(event\) => setSizePreference\(event\.target\.value\)\}/);
  assert.doesNotMatch(source, /setSelectedVariant\([^\n]*sizePreference/);
});

test("request and supplier items bypass local stock while unavailable stays blocked", () => {
  assert.match(source, /availabilityMode === "unavailable"/);
  assert.match(source, /availabilityMode === "request" \|\|[\s\S]*inventoryTrackingMode === "supplier"/);
  assert.match(source, /if \(!targetBypassLocalStock\)[\s\S]*resolveStockClass/);
  assert.match(source, /!targetBypassLocalStock && Number\.isFinite\(availableCount\)/);
  assert.match(source, /Add to availability basket/);
  assert.match(source, /<AvailabilityRequestNotice compact \/>/);
});
