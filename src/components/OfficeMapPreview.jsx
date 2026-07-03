import { PROTO_OFFICE_ADDRESS } from '../lib/brandAssets';

const TILE_SIZE = 256;

function lngLatToWorldPx(lng, lat, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export default function OfficeMapPreview({
  lat = PROTO_OFFICE_ADDRESS.lat,
  lng = PROTO_OFFICE_ADDRESS.lng,
  zoom = 15,
  height = 220,
  href = PROTO_OFFICE_ADDRESS.mapsUrl,
}) {
  const width = 568;
  const center = lngLatToWorldPx(lng, lat, zoom);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;

  const startTileX = Math.floor(originX / TILE_SIZE);
  const startTileY = Math.floor(originY / TILE_SIZE);
  const endTileX = Math.floor((originX + width) / TILE_SIZE);
  const endTileY = Math.floor((originY + height) / TILE_SIZE);

  const tiles = [];
  for (let tx = startTileX; tx <= endTileX; tx += 1) {
    for (let ty = startTileY; ty <= endTileY; ty += 1) {
      tiles.push({
        tx,
        ty,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }

  return (
    <a
      className="about-modal-map-frame"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open PROTO TRADING CC in Google Maps"
    >
      <div className="about-modal-map-tiles" style={{ height }}>
        {tiles.map(({ tx, ty, left, top }) => (
          <img
            key={`${zoom}-${tx}-${ty}`}
            className="about-modal-map-tile"
            src={`https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`}
            alt=""
            loading="lazy"
            draggable={false}
            style={{ left, top }}
          />
        ))}
        <span className="about-modal-map-pin" aria-hidden="true" />
        <span className="about-modal-map-attrib">© OpenStreetMap</span>
      </div>
    </a>
  );
}
