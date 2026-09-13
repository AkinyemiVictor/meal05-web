import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { isAPlusTagBuyOption } from "@/lib/tag-buy-eligibility";

const numeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const isMissingTagSchema = (error) => /tag_batch|schema cache|relation .* does not exist/i.test(String(error?.message || ""));
const demoEnabled = () => process.env.TAG_BUY_DEMO === "1" && process.env.NODE_ENV !== "production";
const demoUuid = (variantId) => `00000000-0000-4000-8000-${String(variantId || 0).replace(/\D/g, "").slice(-12).padStart(12, "0")}`;
const demoBatchFromVariants = (rows) => {
  const members = Array.isArray(rows) ? rows : [];
  const anchor = members[0];
  const tagUnitPrice = Math.max(0, Math.min(...members.map((row) => (
    Number(row.price || 0) / Number(row.base_quantity || 1)
  ))) * 0.88);
  const variants = members.map((row) => ({
    variantId: String(row.id),
    tagPrice: Math.round(tagUnitPrice * Number(row.base_quantity || 1)),
    standardPriceAtOpen: Number(row.price || 0),
    contributionQuantity: Number(row.base_quantity || 1),
  }));
  return {
    id: demoUuid(anchor.id),
    marketId: String(anchor.market_id),
    productId: String(anchor.product_id),
    variantId: String(anchor.id),
    status: "open",
    tagPrice: variants[0].tagPrice,
    standardPriceAtOpen: Number(anchor.price || 0),
    targetQuantity: 50,
    minimumViableQuantity: 35,
    maximumQuantity: 70,
    committedQuantity: 30,
    reservedQuantity: 5,
    remainingQuantity: 35,
    progressPercent: 60,
    shopperCount: 8,
    closesAt: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
    expectedProcurementAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    failurePolicy: "refund",
    purchaseMode: "dual",
    contributionUnit: anchor.base_unit || anchor.unit || "unit",
    contributionQuantity: Number(anchor.base_quantity || 1),
    variants,
    priorityTier: "A+",
    carryForwardBatchId: null,
    targetReachedAt: null,
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    demo: true,
  };
};

async function loadDemoTagBatches(admin, { marketId, productIds, variantIds } = {}) {
  let query = admin
    .from("product_variants")
    .select("id, product_id, market_id, name, unit, price, base_unit, base_quantity, products!inner(sku)")
    .eq("is_active", true);
  if (marketId) query = query.eq("market_id", marketId);
  if (Array.isArray(productIds) && productIds.length) query = query.in("product_id", productIds);
  if (Array.isArray(variantIds) && variantIds.length) query = query.in("id", variantIds);
  const { data, error } = await query.order("id", { ascending: true });
  if (error) throw error;
  const grouped = new Map();
  for (const row of (data || []).filter(isAPlusTagBuyOption)) {
    const key = [row.product_id, row.market_id, String(row.base_unit || row.unit || "unit").toLowerCase()].join(":");
    const members = grouped.get(key) || [];
    members.push(row);
    grouped.set(key, members);
  }
  return [...grouped.values()].map(demoBatchFromVariants);
}

export const normalizeTagBatch = (row) => row ? {
  id: String(row.id),
  marketId: String(row.market_id),
  productId: String(row.product_id),
  variantId: String(row.variant_id),
  status: String(row.status || "draft"),
  tagPrice: numeric(row.tag_price),
  standardPriceAtOpen: numeric(row.standard_price_at_open),
  targetQuantity: numeric(row.target_quantity),
  minimumViableQuantity: numeric(row.minimum_viable_quantity),
  maximumQuantity: numeric(row.maximum_quantity),
  committedQuantity: numeric(row.committed_quantity),
  reservedQuantity: numeric(row.reserved_quantity),
  remainingQuantity: numeric(row.remaining_quantity),
  progressPercent: numeric(row.progress_percent),
  shopperCount: numeric(row.shopper_count),
  closesAt: row.closes_at,
  expectedProcurementAt: row.expected_procurement_at,
  failurePolicy: row.failure_policy || "refund",
  purchaseMode: row.purchase_mode || "dual",
  contributionUnit: row.contribution_unit || "unit",
  variants: Array.isArray(row.variants) ? row.variants : [],
  carryForwardBatchId: row.carry_forward_batch_id || null,
  targetReachedAt: row.target_reached_at || null,
  closedAt: row.closed_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
} : null;

const normalizeTagBatchVariant = (row) => ({
  variantId: String(row.variant_id),
  tagPrice: numeric(row.tag_price),
  standardPriceAtOpen: numeric(row.standard_price_at_open),
  contributionQuantity: numeric(row.contribution_quantity),
});

async function attachBatchVariants(admin, rows = []) {
  if (!rows.length) return rows;
  const batchIds = rows.map((row) => row.id);
  const { data, error } = await admin
    .from("tag_batch_variants")
    .select("tag_batch_id, variant_id, tag_price, standard_price_at_open, contribution_quantity")
    .in("tag_batch_id", batchIds)
    .order("variant_id", { ascending: true });
  if (error) {
    if (isMissingTagSchema(error)) return rows;
    throw error;
  }
  const variantsByBatch = new Map();
  for (const row of data || []) {
    const key = String(row.tag_batch_id);
    const variants = variantsByBatch.get(key) || [];
    variants.push(normalizeTagBatchVariant(row));
    variantsByBatch.set(key, variants);
  }
  return rows.map((row) => ({ ...row, variants: variantsByBatch.get(String(row.id)) || [] }));
}

export async function loadTagBatches({ adminClient, marketId, productIds, variantIds, statuses = ["open"] } = {}) {
  const admin = adminClient || getSupabaseAdminClient();
  let query = admin.from("tag_batch_progress").select("*");
  if (marketId) query = query.eq("market_id", marketId);
  if (Array.isArray(productIds) && productIds.length) query = query.in("product_id", productIds);
  if (Array.isArray(variantIds) && variantIds.length) query = query.in("variant_id", variantIds);
  if (Array.isArray(statuses) && statuses.length) query = query.in("status", statuses);
  const { data, error } = await query.order("closes_at", { ascending: true });
  if (error) {
    if (demoEnabled() && isMissingTagSchema(error)) return loadDemoTagBatches(admin, { marketId, productIds, variantIds });
    if (isMissingTagSchema(error)) return [];
    throw error;
  }
  const rows = (data || []).map(normalizeTagBatch);
  return attachBatchVariants(admin, rows);
}

export async function loadTagBatch(batchId, { adminClient, requireOpen = false } = {}) {
  const id = String(batchId || "").trim();
  if (!id) return null;
  const admin = adminClient || getSupabaseAdminClient();
  const { data, error } = await admin.from("tag_batch_progress").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (demoEnabled() && isMissingTagSchema(error)) {
      const variantId = Number(id.slice(-12));
      const rows = await loadDemoTagBatches(admin, { variantIds: Number.isSafeInteger(variantId) && variantId > 0 ? [variantId] : [] });
      return rows.find((row) => row.id === id) || null;
    }
    if (isMissingTagSchema(error)) return null;
    throw error;
  }
  const [batch] = await attachBatchVariants(admin, data ? [normalizeTagBatch(data)] : []);
  if (!batch) return null;
  if (requireOpen && (batch.status !== "open" || new Date(batch.closesAt).getTime() <= Date.now() || batch.remainingQuantity <= 0)) {
    return null;
  }
  return batch;
}

export const indexOpenTagBatches = (batches = []) =>
  new Map(
    batches
      .filter((batch) => batch?.status === "open")
      .flatMap((batch) => {
        const members = Array.isArray(batch.variants) && batch.variants.length
          ? batch.variants
          : [{ variantId: batch.variantId, tagPrice: batch.tagPrice, standardPriceAtOpen: batch.standardPriceAtOpen, contributionQuantity: 1 }];
        return members.map((member) => [String(member.variantId), {
          ...batch,
          variantId: String(member.variantId),
          tagPrice: Number(member.tagPrice),
          standardPriceAtOpen: Number(member.standardPriceAtOpen),
          contributionQuantity: Number(member.contributionQuantity || 1),
        }]);
      })
  );

export const attachTagBatchesToProduct = (product, batches = []) => {
  if (!product) return product;
  const index = indexOpenTagBatches(batches);
  const variations = Array.isArray(product.variations)
    ? product.variations.map((variant) => {
        const batch = index.get(String(variant?.variationId ?? variant?.variantId ?? "")) || null;
        return batch ? {
          ...variant,
          tagBatch: batch,
        } : variant;
      })
    : product.variations;
  const defaultBatch = index.get(String(product.variantId || "")) || null;
  return {
    ...product,
    variations,
    tagBatch: defaultBatch,
  };
};
