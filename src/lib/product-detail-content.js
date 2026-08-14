export const normalizeProductDetailText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const normaliseTextList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => normalizeProductDetailText(item))
    .filter(Boolean);
};

export const normaliseDatabaseProductDetailContent = (rawProduct) => ({
  description: normalizeProductDetailText(rawProduct?.description),
  handlingProtocols: normaliseTextList(
    rawProduct?.handling_protocols ?? rawProduct?.handlingProtocols
  ),
  storageTips: normaliseTextList(rawProduct?.storage_tips ?? rawProduct?.storageTips),
});

export const normalizeProductEditorialContent = normaliseDatabaseProductDetailContent;

export default normaliseDatabaseProductDetailContent;
