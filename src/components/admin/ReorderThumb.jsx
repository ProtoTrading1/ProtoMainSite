import { useEffect, useState } from 'react';
import { buildImageCandidates } from '../../lib/imageUrl';

export default function ReorderThumb({ src, alt }) {
  const candidates = buildImageCandidates(src);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [src]);

  if (!candidates.length || !candidates[idx]) {
    return <span className="adm-muted">No image</span>;
  }

  return (
    <img
      src={candidates[idx]}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
