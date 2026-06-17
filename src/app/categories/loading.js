import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import ProductGridSkeleton from "@/components/product-grid-skeleton";

export default function CategoriesLoading() {
  return (
    <main className="category-page" aria-busy="true">
      <div className="category-page__header category-page__header--skeleton">
        <span className="skeleton-block skeleton-line skeleton-line--eyebrow" />
        <span className="skeleton-block skeleton-line skeleton-line--heading" />
        <span className="skeleton-block skeleton-line skeleton-line--body" />
      </div>
      <div className="category-products">
        <ProductGridSkeleton count={9} />
      </div>
      <CategoryCarouselSkeleton />
    </main>
  );
}
