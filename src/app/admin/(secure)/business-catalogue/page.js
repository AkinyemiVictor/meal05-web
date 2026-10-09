import AdminBusinessCatalogueEditor from "@/components/admin-business-catalogue-editor";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export default async function BusinessCataloguePage() {
  const admin = getSupabaseAdminClient();
  const [productsResult, variantsResult, productSettingsResult, variantSettingsResult] = await Promise.all([
    admin.from("products").select("id, name").eq("is_active", true).order("name").limit(500),
    admin.from("product_variants").select("id, product_id, name, is_active").eq("is_active", true).order("product_id").limit(2000),
    admin.from("product_mode_settings").select("*").eq("shopping_mode", "business"),
    admin.from("product_variant_mode_settings").select("*").eq("shopping_mode", "business"),
  ]);
  const productIndex = new Map((productsResult.data || []).map((row) => [String(row.id), row]));
  const productSettings = new Map((productSettingsResult.data || []).map((row) => [String(row.product_id), row]));
  const variantSettings = new Map((variantSettingsResult.data || []).map((row) => [String(row.variant_id), row]));
  const rows = (variantsResult.data || []).flatMap((variant) => {
    const product = productIndex.get(String(variant.product_id));
    if (!product) return [];
    const ps = productSettings.get(String(product.id)); const vs = variantSettings.get(String(variant.id));
    return [{ productId: String(product.id), productName: product.name, variantId: String(variant.id), variantName: variant.name || "Default",
      productVisible: ps?.is_visible !== false, productRequiresQuote: ps?.requires_quote === true, purchasingConditions: ps?.purchasing_conditions || "",
      variantVisible: vs?.is_visible !== false, price: vs?.price ?? null, minQuantity: vs?.min_quantity ?? null, maxQuantity: vs?.max_quantity ?? null,
      stepQuantity: vs?.step_quantity ?? null, packagingLabel: vs?.packaging_label || "", availabilityMode: vs?.availability_mode || "standard",
      supplierConfirmationRequired: vs?.supplier_confirmation_required === true, directCheckoutEnabled: vs?.direct_checkout_enabled !== false }];
  });
  return <main style={{ padding: 24 }}><h1 style={{ marginBottom: 6 }}>Business catalogue</h1><p style={{ marginTop: 0, color: "#64748b" }}>Only prices entered here are exposed in Business mode. Leave price blank to require a quotation.</p><AdminBusinessCatalogueEditor rows={rows} /></main>;
}
