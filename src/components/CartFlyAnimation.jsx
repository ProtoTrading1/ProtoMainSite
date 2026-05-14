import { motion } from 'motion/react';
import { ShoppingCart } from 'lucide-react';

export default function CartFlyAnimation({ from, onDone }) {
  const toX = window.innerWidth - 110;
  const toY = 24;

  return (
    <motion.div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        color: '#16a34a',
      }}
      initial={{ x: from.x - 14, y: from.y - 14, scale: 1, opacity: 1 }}
      animate={{ x: toX, y: toY, scale: 0.45, opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.36, 0.07, 0.19, 0.97] }}
      onAnimationComplete={onDone}
    >
      <ShoppingCart size={28} />
    </motion.div>
  );
}
