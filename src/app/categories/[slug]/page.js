import CategoryPage from "@/components/category-page";
import Link from "next/link";
import PageState from "@/components/page-state";
import { loadCategoryProductsPayload } from "@/lib/category-products";
import { buildCategoryPageMetadata } from "@/lib/seo/metadata";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";

export const revalidate = 300;

async function getCategoryPayload(slug) {
  const safeSlug = String(slug || "").trim().toLowerCase();
  return unstable_cache(
    async () => {
      const supabase = getSupabaseAdminClient();
      return loadCategoryProductsPayload(supabase, safeSlug);
    },
    ["category-products", safeSlug],
    {
      revalidate: 300,
      tags: ["catalog-products", `category-products:${safeSlug}`],
    }
  )();
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
  let payload;
  try {
    payload = await getCategoryPayload(slug);
  } catch {
    return (
      <main className="category-page">
        <PageState title="We couldn't load this category right now.">
          <p>Please refresh the page or browse the full catalog while we reconnect.</p>
          <Link href="/shop" className="section-view-button">View all products</Link>
        </PageState>
      </main>
    );
  }
  if (!payload.category) notFound();
  return (
    <CategoryPage
      category={payload.category}
      products={payload.products}
      categories={payload.categories}
      pagination={payload.pagination}
    />
  );
}
