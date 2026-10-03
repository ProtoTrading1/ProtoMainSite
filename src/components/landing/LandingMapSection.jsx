import { Suspense, lazy } from 'react';
import { motion } from 'motion/react';
import SiteErrorBoundary from '../SiteErrorBoundary';

const SouthernAfricaMap = lazy(() => import('../SouthernAfricaMap'));

export default function LandingMapSection() {
  return (
    <motion.section
      className="lp-map-wrapper"
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.48, ease: 'easeOut' }}
    >
      <div className="lp-map-copy">
        <span className="lp-eyebrow">Delivery coverage</span>
        <h2>Serving trade buyers across Southern Africa.</h2>
        <p>
          Proto Trading ships to retailers and resellers throughout South Africa and the wider SADC region. One supplier, nationwide reach.
        </p>
      </div>
      <motion.div
        className="lp-map-inner"
        initial={{ opacity: 0, scale: 0.985 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <SiteErrorBoundary fallback={<p role="status">The interactive map is unavailable. We deliver across South Africa and the wider SADC region.</p>}>
        <Suspense fallback={<div style={{ width: '100%', height: '100%' }} />}>
          <SouthernAfricaMap />
        </Suspense>
        </SiteErrorBoundary>
      </motion.div>
    </motion.section>
  );
}
