export default function ProductGridSkeleton({ count = 6 }) {
  const items = Array.from({ length: count });
  return (
    <div className="product-card-grid product-card-grid--skeleton" aria-hidden="true">
      {items.map((_, index) => (
        <article key={index} className="product-card product-card--skeleton">
          <div className="product-card__skeleton-badges skeleton-block" />
          <div className="product-card__skeleton-image skeleton-block" />
          <div className="product-card__skeleton-content">
            <span className="skeleton-block skeleton-line skeleton-line--wide" />
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line skeleton-line--price" />
          </div>
        </article>
      ))}
    </div>
  );
}
