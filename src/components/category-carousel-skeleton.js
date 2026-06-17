export default function CategoryCarouselSkeleton({ count = 5 }) {
  const items = Array.from({ length: count });
  return (
    <div className="category-carousel category-carousel--loading" aria-hidden="true">
      <div className="category-carousel__header">
        <div className="category-carousel__title">
          <span className="skeleton-block skeleton-line skeleton-line--eyebrow" />
          <span className="skeleton-block skeleton-line skeleton-line--heading" />
        </div>
        <div className="category-carousel__actions">
          <span className="skeleton-block skeleton-line skeleton-line--button" />
        </div>
      </div>
      <div className="category-carousel__viewport">
        <div className="category-carousel__track">
          {items.map((_, index) => (
            <div key={index} className="category-carousel__card category-carousel__card--skeleton">
              <span className="skeleton-block skeleton-square" />
              <span className="skeleton-block skeleton-line skeleton-line--label" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
