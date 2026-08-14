import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Invalidate every public catalogue snapshot after an administrative write.
 * This improves how quickly browsing views reflect a change; cart and order
 * APIs still validate directly against the database and never trust the cache.
 */
export const revalidatePublicCatalog = () => {
  revalidateTag("catalog-products");
  revalidateTag("products");
  revalidatePath("/home");
  revalidatePath("/shop");
  revalidatePath("/search");
  revalidatePath("/categories", "layout");
  revalidatePath("/api/categories");
  revalidatePath("/api/products");
  revalidatePath("/api/catalog", "layout");
};

export default revalidatePublicCatalog;
