import { getDefaultMarket } from "@/lib/market-server";

export const loadMarketCatalog = async (supabase, market = null) => {
  const activeMarket = market || (await getDefaultMarket());
  const { data, error } = await supabase
    .from("product_markets")
    .select("product_id, market_id, local_name, is_listed")
    .eq("market_id", activeMarket.id)
    .eq("is_listed", true);

  if (error) throw new Error(`Unable to load market catalogue: ${error.message}`);

  const listings = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (row?.product_id == null) continue;
    listings.set(String(row.product_id), row);
  }

  return {
    market: activeMarket,
    listings,
    productIds: [...listings.keys()],
  };
};

export const applyMarketListing = (row, catalog) => {
  const productId = row?.product_id ?? row?.id;
  const listing = catalog?.listings?.get(String(productId));
  if (!listing) return null;

  const fallbackName = row?.product_name || row?.local_name || row?.name || "";
  const name = String(listing.local_name || fallbackName).trim() || fallbackName;
  return {
    ...row,
    product_name: name,
    name,
    market_id: catalog.market.id,
    currency_code: row?.currency_code || catalog.market.currencyCode,
    currency_symbol: catalog.market.currencySymbol,
    locale: catalog.market.locale,
    timezone: catalog.market.timezone,
  };
};

export const publicMarket = (market) => ({
  id: market.id,
  code: market.code,
  country: market.country,
  currencyCode: market.currencyCode,
  currencySymbol: market.currencySymbol,
  locale: market.locale,
  timezone: market.timezone,
});
