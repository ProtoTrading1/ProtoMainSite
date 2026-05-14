import { motion } from 'motion/react';
import { ShoppingCart } from 'lucide-react';

export default function CartFlyAnimation({ from, onDone }) {
  // Find the actual cart element on screen
  const cartEl = document.querySelector('.cart-summary');
  const cartRect = cartEl?.getBoundingClientRect();
  const toX = cartRect ? cartRect.left + cartRect.width / 2 - 13 : window.innerWidth - 110;
  const toY = cartRect ? cartRect.top + cartRect.height / 2 - 13 : 26;

  const midX = from.x + (toX - from.x) * 0.4;
  const midY = Math.min(from.y, toY) - 180;

  return (
    <>
      {/* Pulsing ring at origin */}
      <motion.div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 9998,
          pointerEvents: 'none',
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '2px solid #8B1A1A',
          x: from.x - 24,
          y: from.y - 24,
        }}
        initial={{ scale: 0.5, opacity: 0.9 }}
        animate={{ scale: 2.5, opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />

      {/* Flying cart icon */}
      <motion.div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 9999,
          pointerEvents: 'none',
          color: '#8B1A1A',
          filter: 'drop-shadow(0 6px 12px rgba(139,26,26,0.6))',
        }}
        initial={{ x: from.x - 13, y: from.y - 13, scale: 1.1, opacity: 1, rotate: 0 }}
        animate={{
          x: [from.x - 13, midX, toX],
          y: [from.y - 13, midY, toY],
          scale: [1.1, 1.4, 0.3],
          opacity: [1, 1, 0],
          rotate: [0, -25, 10],
        }}
        transition={{ duration: 1.6, ease: 'easeInOut', times: [0, 0.5, 1] }}
        onAnimationComplete={onDone}
      >
        <ShoppingCart size={26} />
      </motion.div>
    </>
  );
}
