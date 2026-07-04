import categories, { getCategoryHref } from "@/data/categories";
import { getAllProducts, buildProductSlug } from "@/lib/products";
import { INDEXABLE_SECTION_SLUGS } from "@/lib/seo/metadata";

const resolveStableLastModified = () => {
  const raw = process.env.SITEMAP_LASTMOD || process.env.VERCEL_GIT_COMMIT_DATE || "";
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const buildUrlEntry = (url, lastModified) => (
  lastModified ? { url, lastModified } : { url }
);

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const stableLastModified = resolveStableLastModified();

  const urls = [];

  // Public indexable pages only
  const staticPaths = [
    "/",
    "/home",
    "/shop",
    "/categories",
    "/about-us",
    "/contact-us",
    "/career",
    "/help-center",
  ];
  for (const p of staticPaths) {
    urls.push(buildUrlEntry(`${baseUrl}${p}`, stableLastModified));
  }

  // Categories
  for (const c of categories) {
    urls.push(buildUrlEntry(`${baseUrl}${getCategoryHref(c)}`, stableLastModified));
  }

  // Section landing pages (indexable only)
  for (const slug of INDEXABLE_SECTION_SLUGS) {
    urls.push(buildUrlEntry(`${baseUrl}/section/${slug}`, stableLastModified));
  }

  // Products
  try {
    const products = getAllProducts();
    for (const product of products) {
      const slug = buildProductSlug(product);
      urls.push(buildUrlEntry(`${baseUrl}/products/${slug}`, stableLastModified));
    }
  } catch (_) {}

  return urls;
}
