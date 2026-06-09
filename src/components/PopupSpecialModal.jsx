import { X } from 'lucide-react';

export default function PopupSpecialModal({ imageUrl, onDismiss }) {
  if (!imageUrl) return null;

  return (
    <div className="topnav-modal-backdrop" onClick={onDismiss} style={{ zIndex: 1200 }}>
      <div
        className="topnav-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 'min(92vw, 720px)', padding: 0, overflow: 'hidden', position: 'relative' }}
      >
        <button type="button" className="topnav-modal-close" onClick={onDismiss} style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
          <X size={18} />
        </button>
        <img src={imageUrl} alt="Special offer" style={{ display: 'block', width: '100%', height: 'auto' }} />
      </div>
    </div>
  );
}
