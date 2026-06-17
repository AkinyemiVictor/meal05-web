export const parseNumberValue = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[^0-9.-]+/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

export const pickFirstNumber = (row, fields = []) => {
  if (!row || typeof row !== "object") return null;
  for (const key of fields) {
    if (row[key] == null || row[key] === "") continue;
    const num = parseNumberValue(row[key]);
    if (num != null) return num;
  }
  return null;
};
