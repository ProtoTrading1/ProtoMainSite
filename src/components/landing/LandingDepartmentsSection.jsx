import { motion } from 'motion/react';

const DEPARTMENTS = [
  { name: 'Art Supplies and Stationery' },
  { name: 'Beads, Jewellery & Accessories' },
  { name: 'Beauty & Personal Care' },
  { name: 'Events & Parties' },
  { name: 'Fashion & Accessories' },
  { name: 'Food & Drinks' },
  { name: 'Hardware' },
  { name: 'Homeware & Kitchen' },
  { name: 'Motarro' },
  { name: 'Packaging' },
  { name: 'Textiles' },
  { name: 'Toys, Games & Kids' },
];

const BRANDS = [
  { name: 'dala', slug: 'dala' },
  { name: 'Mötarro', slug: 'motarro' },
  { name: 'STAEDTLER', slug: 'staedtler' },
  { name: 'Vinnic', slug: 'vinnic' },
  { name: 'Conan', slug: 'conan' },
  { name: 'Marlin', slug: 'marlin' },
  { name: 'Waterlily', slug: 'waterlily' },
  { name: 'OYA', slug: 'oya' },
  { name: 'amazcolor', slug: 'amazcolor' },
  { name: 'Keep Smiling', slug: 'keepsmiling' },
];

export default function LandingDepartmentsSection() {
  return (
    <section className="lp-departments" id="lp-departments">
      <motion.div
        className="lp-section-header"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
      >
        <span className="lp-eyebrow">Catalogue departments</span>
        <h2>12 buying departments, 5,000+ products.</h2>
      </motion.div>
      <div className="lp-dept-tags">
        {DEPARTMENTS.map((dept) => (
          <span className="lp-dept-tag" key={dept.name}>{dept.name}</span>
        ))}
      </div>
      <ul className="lp-dept-list" role="list">
        {DEPARTMENTS.map((dept) => (
          <li key={dept.name}>
            <span className="lp-dept-list-item">{dept.name}</span>
          </li>
        ))}
      </ul>

      {/* ── Brands we work with (endless right-moving marquee) ── */}
      <div className="lp-brands">
        <span className="lp-brands-label">Brands we work with</span>
        <div className="lp-brands-marquee">
          <div className="lp-brands-track">
            {[...BRANDS, ...BRANDS].map((b, i) => (
              <div className="lp-brand" key={`${b.name}-${i}`} aria-hidden={i >= BRANDS.length}>
                <picture>
                  <source
                    type="image/webp"
                    srcSet={`/brands/${b.slug}-180.webp 180w, /brands/${b.slug}-360.webp 360w`}
                    sizes="180px"
                  />
                  <img
                    src={`/brands/${b.slug}.jpg`}
                    alt={b.name}
                    width="180"
                    height="180"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
