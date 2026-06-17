const slugify = (value) => {
  if (!value) return "";
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_/]+/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]+/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
};

export const buildProductSlug = (product) => {
  if (!product) return "";
  const id = product.id != null ? String(product.id) : "";
  const base = slugify(product.name) || "product";
  return id ? `${base}-${id}` : base;
};

export const getAllProducts = () => [];
export const getProductById = () => null;
export const getRawProductById = () => null;
export const getProductBySlug = () => null;
export const getRawProductBySlug = () => null;

export const getProductHref = (product) => {
  const slug = buildProductSlug(product);
  return slug ? `/products/${slug}` : "#";
};
