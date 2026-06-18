export default function ProductGrid({ products = [], renderProduct, children, className = "", ...props }) {
  return (
    <div className={`product-card-grid${className ? ` ${className}` : ""}`} {...props}>
      {typeof renderProduct === "function" ? products.map(renderProduct) : children}
    </div>
  );
}
