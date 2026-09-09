const LAGOS_TIMEZONE = "Africa/Lagos";

const currentMonthInLagos = () => {
  const month = new Intl.DateTimeFormat("en", {
    month: "numeric",
    timeZone: LAGOS_TIMEZONE,
  }).format(new Date());
  return Number(month);
};

const includesMonth = (months, month) =>
  Array.isArray(months) && months.some((value) => Number(value) === month);

export const resolveSeasonStatus = (profile, month = currentMonthInLagos()) => {
  if (!profile || profile.active === false) return "unvalidated";
  if (includesMonth(profile.peak_months, month)) return "peak";
  if (profile.year_round === true) return "year_round";
  if (includesMonth(profile.in_season_months, month)) return "in_season";
  if (includesMonth(profile.shoulder_months, month)) return "shoulder";
  return "out";
};

export async function enrichCatalogSeasonMetadata(admin, products = []) {
  const rows = Array.isArray(products) ? products : [];
  const productIds = [...new Set(rows.map((product) => product?.id).filter(Boolean))];
  if (!productIds.length) return rows;

  const { data, error } = await admin
    .from("products")
    .select("id, brand, sourcing_type, product_season_profiles(peak_months, in_season_months, shoulder_months, year_round, active)")
    .in("id", productIds);

  if (error) throw error;
  const metadataById = new Map(
    (Array.isArray(data) ? data : []).map((row) => {
      const nestedProfiles = row?.product_season_profiles;
      const profiles = Array.isArray(nestedProfiles) ? nestedProfiles : nestedProfiles ? [nestedProfiles] : [];
      const profile = profiles.find((entry) => entry?.active !== false) || null;
      return [
        String(row?.id || ""),
        {
          brand: String(row?.brand || "").trim(),
          sourcingType: String(row?.sourcing_type || "").trim(),
          seasonManaged: Boolean(profile),
          seasonStatus: resolveSeasonStatus(profile),
        },
      ];
    })
  );

  return rows.map((product) => ({
    ...product,
    ...(metadataById.get(String(product?.id || "")) || {
      brand: "",
      sourcingType: "",
      seasonManaged: false,
      seasonStatus: "unvalidated",
    }),
  }));
}
