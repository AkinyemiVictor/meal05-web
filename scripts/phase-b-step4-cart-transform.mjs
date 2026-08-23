import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/cart/page.js";
let source = readFileSync(path, "utf8");

const replaceOrThrow = (before, after, label) => {
  if (!source.includes(before)) {
    throw new Error(`Step 4 transform could not find: ${label}`);
  }
  source = source.replace(before, after);
};

replaceOrThrow(
  'import useDeliverySettings from "@/lib/use-delivery-settings";\nimport { isRequestOnlyItem, SELECTION_MODE_FLEXIBLE, SIZE_PREFERENCE_LABELS } from "@/lib/commerce-options";',
  'import useDeliverySettings from "@/lib/use-delivery-settings";\nimport { CartAvailabilitySummary, CartLineAvailabilityBadge } from "@/components/cart-availability-ux";\nimport {\n  isRequestOnlyItem,\n  SELECTION_MODE_FLEXIBLE,\n  SIZE_PREFERENCE_LABELS,\n  usesTrackedInventory,\n} from "@/lib/commerce-options";',
  "cart availability imports"
);

replaceOrThrow(
  '      const variantMissing = !item.variantId;\n      const requestOnly = isRequestOnlyItem(item);\n\n      if (!product && productLookupStatus === "loading") {',
  '      const variantMissing = !item.variantId;\n      const requestOnly = isRequestOnlyItem(item);\n      const bypassLocalStock = requestOnly || !usesTrackedInventory(item);\n\n      if (!product && productLookupStatus === "loading") {',
  "stock bypass classification"
);

replaceOrThrow(
  '} else if (!requestOnly && (normalised.includes("out") || normalised.includes("sold"))) {',
  '} else if (!bypassLocalStock && (normalised.includes("out") || normalised.includes("sold"))) {',
  "out-of-stock bypass"
);

replaceOrThrow(
  '} else if (normalised.includes("limited") || normalised.includes("low")) {',
  '} else if (!bypassLocalStock && (normalised.includes("limited") || normalised.includes("low"))) {',
  "limited-stock bypass"
);

replaceOrThrow(
  '  const hasCheckoutBlocker = stockStatus.hasError || stockStatus.hasPending;\n  const hasRequestItems = useMemo(() => cartItems.some(isRequestOnlyItem), [cartItems]);\n  const deliverySummaryConfig = useMemo(() => getDeliverySummaryConfig(deliverySettings), [deliverySettings]);',
  '  const hasCheckoutBlocker = stockStatus.hasError || stockStatus.hasPending;\n  const hasRequestItems = useMemo(() => cartItems.some(isRequestOnlyItem), [cartItems]);\n  const requestLineCount = useMemo(() => cartItems.filter(isRequestOnlyItem).length, [cartItems]);\n  const standardLineCount = Math.max(0, cartItems.length - requestLineCount);\n  const deliverySummaryConfig = useMemo(() => getDeliverySummaryConfig(deliverySettings), [deliverySettings]);',
  "request and standard line counts"
);

replaceOrThrow(
  '                {formattedItemsCount} {itemLabel}. ready for delivery',
  '                {hasRequestItems\n                  ? `${formattedItemsCount} ${itemLabel} in basket`\n                  : `${formattedItemsCount} ${itemLabel}. ready for checkout`}',
  "cart header readiness copy"
);

replaceOrThrow(
  '                  const availableCount = getAvailableCount(item.stock);\n                  const effectiveMaxQuantity = Number.isFinite(availableCount)\n                    ? Math.min(maxQuantity ?? availableCount, availableCount)\n                    : maxQuantity;\n                  const rules = getVariantPurchaseRules(item);',
  '                  const requestOnly = isRequestOnlyItem(item);\n                  const bypassLocalStock = requestOnly || !usesTrackedInventory(item);\n                  const availableCount = getAvailableCount(item.stock);\n                  const effectiveMaxQuantity = !bypassLocalStock && Number.isFinite(availableCount)\n                    ? Math.min(maxQuantity ?? availableCount, availableCount)\n                    : maxQuantity;\n                  const rules = getVariantPurchaseRules(item);',
  "cart quantity local-stock bypass"
);

replaceOrThrow(
  '                        <h3>{item.name}</h3>\n                        <div className={styles.cartPriceRow}>',
  '                        <h3>{item.name}</h3>\n                        <CartLineAvailabilityBadge requestOnly={requestOnly} />\n                        <div className={styles.cartPriceRow}>',
  "per-line availability badge"
);

replaceOrThrow(
  '                        {isRequestOnlyItem(item) ? (\n                          <p className={styles.cartWarning} role="status">Availability will be confirmed before payment.</p>\n                        ) : null}\n',
  '',
  "old request warning"
);

replaceOrThrow(
  '<span>Physical size preference</span>',
  '<span>Preferred size</span>',
  "cart flexible preference label"
);

replaceOrThrow(
  '            {hasRequestItems && !bulkRequired ? (\n              <div className={styles.bulkPanel} role="note">\n                <h3>Confirm availability before payment</h3>\n                <p>One or more items need a quick market check. Submit the full basket once; we’ll confirm it within 2 business hours, then open a 2-hour payment window.</p>\n              </div>\n            ) : null}',
  '            {hasRequestItems && !bulkRequired ? (\n              <CartAvailabilitySummary\n                requestCount={requestLineCount}\n                standardCount={standardLineCount}\n              />\n            ) : null}',
  "basket availability explanation"
);

replaceOrThrow(
  '{bulkRequired ? "Continue with fulfilment team" : hasRequestItems ? "Check availability" : "Checkout"}',
  '{bulkRequired ? "Continue with fulfilment team" : hasRequestItems ? "Check basket availability" : "Checkout"}',
  "availability CTA"
);

replaceOrThrow(
  '{hasRequestItems ? "No payment until confirmed" : "Secure checkout"}',
  '{hasRequestItems ? "No payment until requested items are confirmed" : "Secure checkout"}',
  "availability summary hint"
);

writeFileSync(path, source);
console.log("Phase B Step 4 cart transform applied successfully.");
