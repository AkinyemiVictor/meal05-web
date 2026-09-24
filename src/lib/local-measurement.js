const unwrapRelation = (value) => (Array.isArray(value) ? value[0] || null : value || null);

export const normalizeLocalMeasurementInfo = (settings) => {
  const setting = unwrapRelation(settings);
  const profile = unwrapRelation(
    setting?.profile ?? setting?.local_measurement_profiles ?? setting?.localMeasurementProfile
  );
  const kgPerCongo = Number(profile?.kg_per_congo ?? profile?.kgPerCongo);

  if (!profile || profile.is_active !== true || !Number.isFinite(kgPerCongo) || kgPerCongo <= 0) {
    return null;
  }

  const displayName = String(profile.display_name ?? profile.displayName ?? "").trim();
  return {
    kgPerCongo,
    ...(displayName ? { displayName } : {}),
  };
};

export const formatKgPerCongo = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(3) : "";
};
