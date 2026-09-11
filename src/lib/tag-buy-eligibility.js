const A_PLUS_OPTION_NAMES = new Map([
  ["CHICKEN-EGGS-PULLET-SMALL", new Set(["1 Pack (6 Pieces)", "Half Crate (15 Pieces)", "1 Crate (30 Pieces)"])],
  ["CHICKEN-EGGS-MEDIUM", new Set(["1 Pack (6 Pieces)", "Half Crate (15 Pieces)", "1 Crate (30 Pieces)"])],
  ["CHICKEN-EGGS-JUMBO-LARGE", new Set(["1 Pack (6 Pieces)", "Half Crate (15 Pieces)", "1 Crate (30 Pieces)"])],
  ["SWEET-POTATO-100KG", new Set(["1kg", "1 Paint Bucket (3.5kg)"])],
  ["MAIDUGURI-HONEY-BEANS-OLOYIN-50KG", new Set(["1kg", "Half Paint Bucket (2kg)", "1 Paint Bucket (4kg)"])],
]);

export const isAPlusTagBuyOption = (row) => {
  const sku = String(row?.products?.sku || row?.productSku || "").trim();
  const name = String(row?.name || "").trim();
  return A_PLUS_OPTION_NAMES.get(sku)?.has(name) === true;
};

