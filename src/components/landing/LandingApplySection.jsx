import { motion } from 'motion/react';

export default function LandingApplySection({ children }) {
  return (
    <section className="lp-apply-wrapper" id="lp-apply">
      <motion.div
        className="lp-apply-copy"
        initial={{ opacity: 0, x: -16 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <span className="lp-eyebrow lp-eyebrow-light">Apply for access</span>
        <h2>Get access to Proto Trading&apos;s catalogue.</h2>
      </motion.div>

      <motion.div
        className="lp-apply-card"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </section>
  );
}
