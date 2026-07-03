import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgePercent,
  Check,
  ChevronRight,
  Flame,
  Mail,
  Menu,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import './worldclass.css';
import ProtoLogo from '../components/ProtoLogo';

const categories = [
  'All Products',
  'Bags, Wallets & Accessories',
  'Beads, Jewellery & Accessories',
  'Toys, Games & Novelty',
  'Packaging',
  'Homeware & Kitchen',
  'Hardware',
  'Arts, Crafts & Stationery',
];

const catalogue = [
  {
    id: 1,
    code: '0001-BLK',
    name: 'Ladies Structured Crossbody Bag | Black | Strap Included',
    category: 'Bags, Wallets & Accessories',
    price: 216.52,
    image: '/bag_black.png',
    tags: ['Hot seller', 'Fast reseller'],
    pack: '12 per carton',
    status: 'In stock',
  },
  {
    id: 2,
    code: '0001-CRM',
    name: 'Ladies Structured Crossbody Bag | Cream | Strap Included',
    category: 'Bags, Wallets & Accessories',
    price: 216.52,
    image: '/bag_cream.png',
    tags: ['New stock', 'Trade favourite'],
    pack: '12 per carton',
    status: 'In stock',
  },
  {
    id: 3,
    code: '03890-BL',
    name: 'Glass Czech Beads Loose | White and Red | Size 8/0',
    category: 'Beads, Jewellery & Accessories',
    price: 13.04,
    image: '/beads_redwhite.png',
    tags: ['Under R50', 'Bulk buy'],
    pack: '1/4kg packs',
    status: 'In stock',
  },
  {
    id: 4,
    code: '8616-RED',
    name: 'Wood Painted Beads | 6mm Red | Retail Craft Pack',
    category: 'Beads, Jewellery & Accessories',
    price: 47.83,
    image: '/beads_woodred.png',
    tags: ['Hot seller', 'Bulk buy'],
    pack: 'Assorted inner packs',
    status: 'In stock',
  },
  {
    id: 5,
    code: '7721-BLU',
    name: 'School Backpack | Royal Blue | Reinforced Daily Use',
    category: 'Bags, Wallets & Accessories',
    price: 185,
    image: '/school_bag.png',
    tags: ['Seasonal volume'],
    pack: '6 per carton',
    status: 'Confirm stock',
  },
  {
    id: 6,
    code: 'PK-992',
    name: 'Kraft Paper Bags | Medium | 50 Piece Wholesale Bundle',
    category: 'Packaging',
    price: 120,
    image: '/kraft_bags.png',
    tags: ['Eco range', 'Bulk buy'],
    pack: '50 pieces',
    status: 'In stock',
  },
];

const shortcuts = [
  { label: 'Hot sellers', query: 'hot', icon: Flame },
  { label: 'Under R50', query: 'under r50', icon: BadgePercent },
  { label: 'New stock', query: 'new', icon: Sparkles },
  { label: 'Quick order', query: '', icon: Zap },
];

function filterProducts(products, category, query, sort) {
  const search = query.trim().toLowerCase();
  const filtered = products.filter((product) => {
    const inCategory = category === 'All Products' || product.category === category;
    const text = `${product.code} ${product.name} ${product.category} ${product.tags.join(' ')}`.toLowerCase();
    return inCategory && (!search || text.includes(search));
  });

  return [...filtered].sort((a, b) => {
    if (sort === 'price-low') return a.price - b.price;
    if (sort === 'price-high') return b.price - a.price;
    if (sort === 'code') return a.code.localeCompare(b.code);
    return Number(b.tags.includes('Hot seller')) - Number(a.tags.includes('Hot seller'));
  });
}

function ProductCard({ product, onAdd }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const add = () => {
    onAdd(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article className="wc-product-card">
      <div className="wc-product-image">
        <div>{product.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <img src={product.image} alt={product.name} />
      </div>
      <div className="wc-product-body">
        <div className="wc-product-meta"><span>{product.code}</span><b>{product.status}</b></div>
        <h3>{product.name}</h3>
        <p>{product.category} | {product.pack}</p>
        <div className="wc-price"><strong>R{product.price.toFixed(2)}</strong><span>excl. VAT</span></div>
        <div className="wc-buy-row">
          <div className="wc-stepper">
            <button onClick={() => setQty(Math.max(1, qty - 1))}><Minus size={14} /></button>
            <span>{qty}</span>
            <button onClick={() => setQty(qty + 1)}><Plus size={14} /></button>
          </div>
          <button className={added ? 'wc-add is-added' : 'wc-add'} onClick={add}>
            {added ? <Check size={15} /> : <ShoppingCart size={15} />}
            {added ? 'Added' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function WorldClassPortal() {
  const [category, setCategory] = useState('All Products');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [mobileNav, setMobileNav] = useState(false);
  const [cart, setCart] = useState([{ product: catalogue[2], qty: 12 }, { product: catalogue[3], qty: 6 }]);

  const products = useMemo(() => filterProducts(catalogue, category, query, sort), [category, query, sort]);
  const total = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const units = cart.reduce((sum, item) => sum + item.qty, 0);
  const ready = total >= 1000;

  const addToCart = (product, qty) => {
    setCart((current) => {
      const match = current.find((item) => item.product.id === product.id);
      if (match) return current.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + qty } : item);
      return [...current, { product, qty }];
    });
  };

  const updateQty = (id, qty) => {
    setCart((current) => current.map((item) => item.product.id === id ? { ...item, qty: Math.max(1, qty) } : item));
  };

  const removeItem = (id) => setCart((current) => current.filter((item) => item.product.id !== id));

  return (
    <div className="wc-shell">
      <header className="wc-header">
        <button className="wc-icon-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
        <ProtoLogo variant="full" size="md" className="wc-brand" />
        <label className="wc-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, SKU codes or trade lines" /></label>
        <div className="wc-header-cart"><ShoppingCart size={21} /><span>{units}</span><strong>R{total.toFixed(2)}</strong></div>
      </header>

      <div className="wc-layout">
        <aside className={mobileNav ? 'wc-sidebar is-open' : 'wc-sidebar'}>
          <div className="wc-sidebar-head"><strong>Categories</strong><button onClick={() => setMobileNav(false)}><X size={18} /></button></div>
          {categories.map((item) => (
            <button className={item === category ? 'is-active' : ''} key={item} onClick={() => { setCategory(item); setMobileNav(false); }}>
              <span>{item}</span><b>{item === 'All Products' ? catalogue.length : catalogue.filter((p) => p.category === item).length}</b><ChevronRight size={14} />
            </button>
          ))}
          <div className="wc-trust-card">
            <ShieldCheck size={19} />
            <strong>Trade customers only</strong>
            <span>Wholesale pricing, stock and delivery are confirmed by the sales team.</span>
          </div>
        </aside>

        <main className="wc-content">
          <section className="wc-hero">
            <div>
              <span>Logged-in wholesale portal</span>
              <h1>Build a quote-ready order from fast-moving trade stock.</h1>
              <p>Search, browse categories, add quantities, and send a clean wholesale request to Proto Trading.</p>
              <div className="wc-metrics"><b>5,000+ lines</b><b>R1,000 minimum</b><b>SA-wide support</b></div>
            </div>
            <img src="/hero-cluster.png" alt="Proto Trading wholesale products" />
          </section>

          <section className="wc-shortcuts">
            {shortcuts.map(({ label, query: shortcutQuery, icon: Icon }) => (
              <button key={label} onClick={() => setQuery(shortcutQuery)}><Icon size={20} /><span>{label}</span><ArrowRight size={14} /></button>
            ))}
          </section>

          <section className="wc-results-head">
            <div><span>Catalogue</span><h2>{category}</h2><p>{products.length} products shown</p></div>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="code">SKU code</option>
            </select>
          </section>

          <section className="wc-grid">
            {products.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}
          </section>
        </main>

        <aside className="wc-drawer">
          <div className="wc-drawer-head"><span>Wholesale order</span><h2>My Order</h2><p>{cart.length} line items</p></div>
          <div className="wc-cart-lines">
            {cart.map((item) => (
              <div className="wc-cart-line" key={item.product.id}>
                <img src={item.product.image} alt="" />
                <div><strong>{item.product.name}</strong><span>{item.product.code}</span><b>R{(item.product.price * item.qty).toFixed(2)}</b></div>
                <div className="wc-mini-stepper"><button onClick={() => updateQty(item.product.id, item.qty - 1)}>-</button><span>{item.qty}</span><button onClick={() => updateQty(item.product.id, item.qty + 1)}>+</button></div>
                <button onClick={() => removeItem(item.product.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="wc-drawer-foot">
            <div><span>Subtotal excl. VAT</span><strong>R{total.toFixed(2)}</strong></div>
            <p>{ready ? 'Minimum reached. Ready to submit.' : `Add R${(1000 - total).toFixed(2)} more to reach the minimum.`}</p>
            <button disabled={!ready}><Mail size={16} /> Send quote request</button>
            <small><Truck size={14} /> Stock, VAT and delivery confirmed by reply.</small>
          </div>
        </aside>
      </div>

      <footer className="wc-sticky"><span>{units} units</span><strong>R{total.toFixed(2)}</strong><b>{ready ? 'Ready to submit' : 'Minimum order not reached'}</b></footer>
    </div>
  );
}
