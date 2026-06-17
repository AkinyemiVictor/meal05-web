import CategoryPage from "@/components/category-page";
import { loadCategoryProductsPayload } from "@/lib/category-products";
import { buildCategoryPageMetadata } from "@/lib/seo/metadata";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getCategoryPayload(slug) {
  const supabase = getSupabaseAdminClient();
  return loadCategoryProductsPayload(supabase, slug);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const { category } = await getCategoryPayload(slug);
    if (!category) return { title: "Meal05 | Category Not Found" };
    return buildCategoryPageMetadata(category);
  } catch {
    return { title: "Meal05 | Category" };
  }
}

export default async function CategoryRoute({ params }) {
  const { slug } = await params;
  const payload = await getCategoryPayload(slug);
  if (!payload.category) notFound();
  return (
    <CategoryPage
      category={payload.category}
      products={payload.products}
      categories={payload.categories}
    />
  );
}
