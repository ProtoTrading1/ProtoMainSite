// Supabase Storage supports on-the-fly image transformation via the /render/image/ path.
// This shrinks images from ~200–800KB full-res JPEG to ~15–40KB WebP at display size,
// served from Supabase's global CDN.
export function optimizedImageUrl(url, { width = 400, quality = 75 } = {}) {
  if (!url || !url.includes('.supabase.co/storage/v1/object/public/')) return url;
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    `?width=${width}&quality=${quality}&format=webp`
  );
}
