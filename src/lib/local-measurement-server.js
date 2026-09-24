import { normalizeLocalMeasurementInfo } from "@/lib/local-measurement";

const uniqueProductIds = (productIds = []) =>
  Array.from(
    new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

export async function loadLocalMeasurementInfoByProductIds(client, productIds = []) {
  const ids = uniqueProductIds(productIds);
  if (!client || !ids.length) return new Map();

  const { data, error } = await client
    .from("product_measurement_settings")
    .select("product_id, profile:local_measurement_profiles(display_name, kg_per_congo, is_active)")
    .in("product_id", ids);

  if (error) throw error;

  return new Map(
    (Array.isArray(data) ? data : [])
      .map((row) => [String(row?.product_id ?? ""), normalizeLocalMeasurementInfo(row)])
      .filter(([productId, measurementInfo]) => productId && measurementInfo)
  );
}

export async function attachLocalMeasurementInfo(client, products = []) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return list;

  let infoByProductId = new Map();
  try {
    infoByProductId = await loadLocalMeasurementInfoByProductIds(
      client,
      list.map((product) => product?.id)
    );
  } catch {
    // Measurement guidance is supplementary; a metadata outage must not block ordering.
  }

  return list.map((product) => ({
    ...product,
    measurementInfo: infoByProductId.get(String(product?.id ?? "")) || null,
  }));
}
