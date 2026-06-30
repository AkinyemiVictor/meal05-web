import Link from "next/link";
import PageState from "@/components/page-state";
import { loadCategoryCounts, loadCategoryRows, mapCategoryRows } from "@/lib/categories-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const metadata = {
  title: "Meal05 | Shop by Category",
  description: "Browse fresh produce, proteins, grains, and more. Farm-sourced and delivered to your door in Ibadan.",
};

export const dynamic = "force-dynamic";

async function getCategories() {
  try {
    const supabase = getSupabaseAdminClient();
    const rows = await loadCategoryRows(supabase);
    const counts = await loadCategoryCounts(supabase);
    return { categories: mapCategoryRows(rows, counts), error: null };
  } catch {
    return { categories: [], error: "Unable to load categories right now." };
  }
}

export default async function CategoriesPage() {
  const { categories, error } = await getCategories();

  return (
    <main className="categories-page">
      <div className="categories-page__inner">
        <nav className="categories-page__breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span style={{ margin: "0 0.5rem" }}>/</span>
          <span>Shop</span>
        </nav>

        <header className="categories-page__header">
          <p>
            Browse
          </p>
          <h1>Explore categories <i aria-hidden="true" /></h1>
          <p>
            Farm-sourced and delivered fresh to your door in Ibadan.
          </p>
        </header>

        {error ? (
          <PageState title="We couldn't load categories right now.">
            <p>Please refresh the page or try again in a moment.</p>
            <Link href="/shop" className="section-view-button">View all products</Link>
          </PageState>
        ) : categories.length ? (
          <div className="categories-grid">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}`}
                className="categories-grid__card"
              >
                <span className="categories-grid__icon" aria-hidden="true">
                  <i className={`fa-solid ${cat.icon}`} />
                </span>
                <span className="categories-grid__label">{cat.label}</span>
                <span className="categories-grid__divider" aria-hidden="true" />
                <span className="categories-grid__count">{Number(cat.count ?? cat.product_count ?? 0)} items</span>
              </Link>
            ))}
          </div>
        ) : (
          <PageState title="No categories are available right now.">
            <p>We are updating the aisles. You can still browse the full catalog.</p>
            <Link href="/shop" className="section-view-button">View all products</Link>
          </PageState>
        )}
      </div>
    </main>
  );
}
