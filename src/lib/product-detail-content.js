const normaliseText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const normaliseTextList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normaliseText(String(item ?? "")))
    .filter(Boolean);
};

export const normaliseDatabaseProductDetailContent = (rawProduct) => ({
  description: normaliseText(rawProduct?.description),
  handlingProtocols: normaliseTextList(
    rawProduct?.handling_protocols ?? rawProduct?.handlingProtocols
  ),
  storageTips: normaliseTextList(rawProduct?.storage_tips ?? rawProduct?.storageTips),
});

export default normaliseDatabaseProductDetailContent;
