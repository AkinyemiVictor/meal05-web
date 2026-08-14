export const normalizeProductDetailText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const normalizeProductDetailList = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeProductEditorialContent = (rawProduct) => ({
  description: normalizeProductDetailText(rawProduct?.description),
  handlingProtocols: normalizeProductDetailList(rawProduct?.handling_protocols),
  storageTips: normalizeProductDetailList(rawProduct?.storage_tips),
});
