import { motion } from 'motion/react';
import { ShoppingCart } from 'lucide-react';

export default function CartFlyAnimation({ from, onDone }) {
  const toX = window.innerWidth - 110;
  const toY = 26;

  // Arc: peak midpoint rises above both start and end
  const midX = from.x + (toX - from.x) * 0.45;
  const midY = Math.min(from.y, toY) - 120;

  return (
    <motion.div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        color: '#16a34a',
        filter: 'drop-shadow(0 4px 8px rgba(22,163,74,0.5))',
      }}
      initial={{ x: from.x - 14, y: from.y - 14, scale: 1, opacity: 1, rotate: 0 }}
      animate={{
        x: [from.x - 14, midX, toX],
        y: [from.y - 14, midY, toY],
        scale: [1, 1.2, 0.35],
        opacity: [1, 1, 0],
        rotate: [0, -20, 0],
      }}
      transition={{ duration: 0.65, ease: 'easeInOut', times: [0, 0.45, 1] }}
      onAnimationComplete={onDone}
    >
      <ShoppingCart size={26} />
    </motion.div>
  );
}
