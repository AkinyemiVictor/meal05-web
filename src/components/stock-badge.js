import { getStockBadge } from "@/lib/stock";

export default function StockBadge({ stock, threshold = 5, className = "" }) {
  const badge = getStockBadge(stock, threshold);
  if (!badge) return null;

  return (
    <span className={`stock-badge stock-badge--${badge.tone} ${className}`.trim()}>
      {badge.label}
    </span>
  );
}
