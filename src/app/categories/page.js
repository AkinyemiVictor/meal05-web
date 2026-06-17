import Link from "next/link";
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
    return mapCategoryRows(rows, counts);
  } catch {
    return [];
  }
}

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <main>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <nav aria-label="Breadcrumb" style={{ marginBottom: "1.5rem", fontSize: "0.875rem", color: "var(--mk-text-subtle)" }}>
          <Link href="/">Home</Link>
          <span style={{ margin: "0 0.5rem" }}>/</span>
          <span>Shop</span>
        </nav>

        <header style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mk-accent)", marginBottom: "0.4rem" }}>
            Browse
          </p>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 800, color: "var(--mk-text)" }}>
            Shop by category
          </h1>
          <p style={{ color: "var(--mk-text-subtle)", marginTop: "0.5rem" }}>
            Farm-sourced and delivered fresh to your door in Ibadan.
          </p>
        </header>

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
              <span className="categories-grid__desc">{cat.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
