import AdminTagBatchControl from "@/components/admin-tag-batch-control";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadTagBatches } from "@/lib/tag-buy-server";

export const dynamic = "force-dynamic";

export default async function AdminTagBuysPage() {
  const admin = getSupabaseAdminClient();
  const [batches, variantsResult] = await Promise.all([
    loadTagBatches({ adminClient: admin, statuses: [] }),
    admin.from("product_variants").select("id, product_id, name, price, unit, is_active, tag_buy_eligible, tag_buy_purchase_mode, tag_buy_priority_tier, products(name)").eq("is_active", true).eq("tag_buy_eligible", true).order("product_id").order("id"),
  ]);
  if (variantsResult.error) throw variantsResult.error;
  const variants = (variantsResult.data || []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.products?.name || `Product ${row.product_id}`,
    name: row.name || row.unit || "Default",
    price: Number(row.price || 0),
    purchaseMode: row.tag_buy_purchase_mode || "dual",
    priorityTier: row.tag_buy_priority_tier || null,
  }));
  const productNames = new Map(variants.map((row) => [String(row.productId), row.productName]));
  const variantNames = new Map(variants.map((row) => [String(row.id), row.name]));
  const rows = batches.map((batch) => ({ ...batch, productName: productNames.get(batch.productId), variantName: variantNames.get(batch.variantId) }));
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Tag Buys</h1>
      <p style={{ color: "#64748b" }}>Create group-purchase batches, monitor paid progress, and close each batch into procurement or its configured failure policy.</p>
      <AdminTagBatchControl batches={rows} variants={variants} />
    </main>
  );
}
