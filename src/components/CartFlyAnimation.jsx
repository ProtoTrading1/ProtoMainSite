import { ShoppingCart } from 'lucide-react';
import './CartFlyAnimation.css';

export default function CartFlyAnimation({ from, onDone }) {
  // Find the actual cart element on screen
  const cartEl = document.querySelector('.cart-summary');
  const cartRect = cartEl?.getBoundingClientRect();
  const toX = cartRect ? cartRect.left + cartRect.width / 2 - 13 : window.innerWidth - 110;
  const toY = cartRect ? cartRect.top + cartRect.height / 2 - 13 : 26;

  const animationStyle = {
    '--cart-fly-from-x': `${from.x - 13}px`,
    '--cart-fly-from-y': `${from.y - 13}px`,
    '--cart-fly-to-x': `${toX}px`,
    '--cart-fly-to-y': `${toY}px`,
  };

  return (
    <div className="cart-fly-layer" style={animationStyle} aria-hidden="true">
      <div
        className="cart-fly-ring"
        style={{ left: from.x - 24, top: from.y - 24 }}
      />
      <div
        className="cart-fly-icon"
        onAnimationEnd={onDone}
      >
        <ShoppingCart size={26} />
      </div>
    </div>
  );
}
