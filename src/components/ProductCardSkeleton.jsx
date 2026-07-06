export default function ProductCardSkeleton() {
  return (
    <div className="product-card pc-skeleton" aria-hidden="true">
      <div className="pc-skeleton-image" />
      <div className="product-body">
        <div className="pc-skeleton-line pc-skeleton-line--title" />
        <div className="pc-skeleton-line pc-skeleton-line--sku" />
        <div className="pc-skeleton-line pc-skeleton-line--price" />
        <div className="pc-skeleton-line pc-skeleton-line--badge" />
        <div className="pc-skeleton-button" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 12 }) {
  return (
    <div className="product-grid" role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
