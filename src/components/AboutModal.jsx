import { Mail, MapPin, Phone, X } from 'lucide-react';
import { PROTO_OFFICE_ADDRESS } from '../lib/brandAssets';

export default function AboutModal({ onClose }) {
  return (
    <div className="topnav-modal-backdrop" onClick={onClose}>
      <div className="about-modal-dark" onClick={(e) => e.stopPropagation()}>
        <button className="about-modal-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>

        <div className="about-modal-header">
          <span className="about-modal-eyebrow">Since 1987</span>
          <h2 className="about-modal-title">About Proto Trading</h2>
          <p className="about-modal-sub">Serving South African businesses for nearly four decades</p>
        </div>

        <div className="about-modal-body">
          <p>For nearly four decades, Proto Trading has been a trusted partner to retailers, resellers, schools, manufacturers, online sellers, event companies, and businesses across South Africa.</p>
          <p>Established in 1987, Proto Trading has grown from a small wholesale operation into one of South Africa's most diverse importers and distributors, supplying thousands of products across multiple categories from a single source.</p>
          <p>Our success has been built on a simple principle: provide customers with quality products, competitive pricing, reliable service, and long-term value.</p>

          <h3 className="about-modal-section-title">Why customers choose Proto</h3>
          <ul className="about-modal-list">
            {['Extensive product selection', 'Competitive wholesale pricing', 'Consistent stock availability', 'Nationwide supply capability', 'Reliable customer service', 'Long-standing industry experience', 'Commitment to quality and value'].map((item) => (
              <li key={item}><span>✓</span>{item}</li>
            ))}
          </ul>

          <div className="about-modal-stats">
            <div><strong>1987</strong><span>Established</span></div>
            <div><strong>5,000+</strong><span>Product lines</span></div>
            <div><strong>SA-wide</strong><span>Delivery</span></div>
            <div><strong>40 yrs</strong><span>Experience</span></div>
          </div>

          <div className="about-modal-visit">
            <h3 className="about-modal-section-title">Find us</h3>
            <a
              className="about-modal-map-frame"
              href={PROTO_OFFICE_ADDRESS.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get directions to PROTO TRADING CC in Google Maps"
            >
              <img
                className="about-modal-map-image"
                src={PROTO_OFFICE_ADDRESS.mapImage}
                alt="Stylised location map for Proto Trading"
                loading="lazy"
              />
              <span className="about-modal-map-label">
                <MapPin size={15} />
                Proto Trading
              </span>
              <span className="about-modal-map-directions">Get directions</span>
            </a>
            <p className="about-modal-visit-address">
              <strong>{PROTO_OFFICE_ADDRESS.label}</strong>
              {PROTO_OFFICE_ADDRESS.company}
              <br />
              {PROTO_OFFICE_ADDRESS.street}
              <br />
              {PROTO_OFFICE_ADDRESS.area}
            </p>
            <div className="about-modal-contact-links">
              <a className="about-modal-contact-link" href={`tel:${PROTO_OFFICE_ADDRESS.phoneTel}`}>
                <Phone size={15} />
                {PROTO_OFFICE_ADDRESS.phone}
              </a>
              <a className="about-modal-contact-link" href={`mailto:${PROTO_OFFICE_ADDRESS.email}`}>
                <Mail size={15} />
                {PROTO_OFFICE_ADDRESS.email}
              </a>
              <a
                className="about-modal-contact-link"
                href={PROTO_OFFICE_ADDRESS.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={15} />
                Open in Google Maps
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
