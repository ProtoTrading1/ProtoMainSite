import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, PackageSearch, RefreshCw, Search, Store, X } from 'lucide-react';
import ProductCard from './ProductCard';
import { fetchExtendedRange } from '../lib/extendedRange';
import { compareInstoreSearch, discoveryGroup, discoveryTiles, matchesInstoreSearch } from '../../lib/instore-discovery.mjs';
import './InstoreProducts.css';
import './InstoreDisclaimer.css';

function localPage(catalogue, query, category, page) {
 const products = catalogue.filter((product) => matchesInstoreSearch(product, query)
    && (!category || discoveryGroup(product) === category)).sort((left, right) => compareInstoreSearch(left, right, query));
  const from = (page - 1) * 60;
  return { products: products.slice(from, from + 60), total: products.length, tiles: discoveryTiles(catalogue) };
}

export default function ExtendedRangePage({ addToCart, cartQtyMap = {}, cartPreferenceMap = {}, specialsMap = {} }) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 60 });
  const [tiles, setTiles] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [category, setCategory] = useState('Beads & jewellery making');
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const resultsRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(catalogue)) {
      const local = localPage(catalogue, submittedQuery, category, page);
      setProducts(local.products);
      setTiles(local.tiles);
      setMeta({ total: local.total, page, pageSize: 60 });
      setLoading(false); setError(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true); setError(false);
    fetchExtendedRange(submittedQuery, { signal: controller.signal, page, category, includeCatalogue: true })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (Array.isArray(data?.catalogue)) setCatalogue(data.catalogue);
        setProducts(Array.isArray(data?.products) ? data.products : []);
        setTiles(Array.isArray(data?.tiles) ? data.tiles : []);
        setMeta({ total: Math.max(0, Number(data?.total) || 0), page: Number(data?.page) || page, pageSize: Math.max(1, Number(data?.pageSize) || 60) });
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [submittedQuery, page, retry, category, catalogue]);

  const preferenceFor = (id) => Object.hasOwn(preferences, id) ? preferences[id] : (cartPreferenceMap[id] || '');
  const choose = (value, nextCategory = category) => { setQuery(value); setSubmittedQuery(value); setCategory(nextCategory); setPage(1); };
  // A typed search is a fresh discovery task, not an extra hidden category
  // constraint. Category tiles remain a separate, explicit filter.
  const submit = (event) => { event.preventDefault(); setSubmittedQuery(query.trim()); setCategory(''); setPage(1); };
  const clear = () => { setQuery(''); setSubmittedQuery(''); setCategory(''); setPage(1); searchRef.current?.focus(); };
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.total, first + products.length - 1);
  const changePage = (next) => { setPage(next); resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); };
  const guideActionStyle = { width: '100%', border: 0, padding: 0, background: 'transparent', color: 'inherit', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', font: 'inherit', cursor: 'pointer' };

  return <section className="instore" aria-labelledby="instore-title">
    <header className="instore-hero">
      <div><span className="instore-eyebrow"><Store size={15} aria-hidden="true" /> PROTO · INSTORE PRODUCTS</span><h1 id="instore-title">More products,<br />ready to order<span aria-hidden="true">.</span></h1><p>Search by everyday product names, see available stock, and add a colour or design preference for each item.</p></div>
      <ol className="instore-guide">
        <li><button type="button" style={guideActionStyle} onClick={() => searchRef.current?.focus()}><b>01</b><span>Search in plain language</span></button></li>
        <li><button type="button" style={guideActionStyle} onClick={() => resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}><b>02</b><span>Check live stock</span></button></li>
        <li><button type="button" style={guideActionStyle} onClick={() => { resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); window.setTimeout(() => resultsRef.current?.querySelector('textarea')?.focus(), 350); }}><b>03</b><span>Add your preference</span></button></li>
      </ol>
    </header>
    <aside className="instore-disclaimer" aria-label="Product image quality notice"><strong>Product images</strong><span>Some Instore product images are lower resolution and are for reference. Colours and details may differ from the actual product.</span></aside>
    <div className="instore-toolbar">
      <div><span className="instore-kicker">LIVE COLLECTION</span><h2>What are you looking for?</h2><p>Try everyday words, such as “wooden bracelet”.</p></div>
      <form className="instore-search" role="search" onSubmit={submit}>
        <label className="instore-sr-only" htmlFor="instore-search">Search Instore Products</label>
        <div><Search size={18} aria-hidden="true" /><input ref={searchRef} id="instore-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try bracelets, hair clips, mugs…" maxLength={80} />{(query || submittedQuery) && <button type="button" onClick={clear} aria-label="Clear search"><X size={16} /></button>}</div>
        <button type="submit">Search <ArrowRight size={16} /></button>
      </form>
    </div>
    {tiles.length > 0 && <nav className="instore-tiles" aria-label="Browse by product type">{tiles.map((tile) => <button key={tile.label} type="button" aria-pressed={category === tile.label} onClick={() => choose('', category === tile.label ? '' : tile.label)}><img src={tile.image} alt="" /><span>{tile.label}<small>{tile.count.toLocaleString()} products</small></span><ArrowRight size={16} /></button>)}</nav>}
    <div ref={resultsRef} className="instore-results" tabIndex={-1} aria-busy={loading}>
      <p className="instore-summary" role="status" aria-live="polite">{loading ? 'Loading Instore Products…' : error ? 'Products could not be loaded.' : products.length ? `${first.toLocaleString()}–${last.toLocaleString()} of ${meta.total.toLocaleString()} products${submittedQuery ? ` for “${submittedQuery}”` : ''}` : submittedQuery ? `No results for “${submittedQuery}”` : 'The collection is currently empty.'}</p>
      {loading && <div className="instore-loading">Loading products…</div>}
      {!loading && error && <div className="instore-state" role="alert"><RefreshCw size={28} /><h3>Let’s try that again</h3><p>We couldn’t load Instore Products. Your basket has not changed.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
      {!loading && !error && !products.length && <div className="instore-state"><PackageSearch size={30} /><h3>No products found</h3><p>Try a shorter name or a different word.</p><button type="button" onClick={clear}>Clear search</button></div>}
      {!loading && !error && products.length > 0 && <><div className="instore-grid">{products.map((product, index) => <article key={product.id} className="instore-item"><ProductCard product={product} addToCart={(item, qty, point) => addToCart(item, qty, point, preferenceFor(product.id))} cartQty={cartQtyMap[product.id] || 0} special={specialsMap[product.id] || null} priority={index < 4} /><label className="instore-preference">Preferred colour/design <small>(optional)</small><textarea value={preferenceFor(product.id)} onChange={(event) => setPreferences((current) => ({ ...current, [product.id]: event.target.value }))} maxLength={240} rows={2} placeholder="e.g. dark brown, if available" /><span>Subject to availability. Your preference will accompany this item.</span></label></article>)}</div>{pages > 1 && <nav className="instore-pagination" aria-label="Product pages"><button disabled={page <= 1} type="button" onClick={() => changePage(page - 1)}><ArrowLeft size={16} /> Previous</button><span>Page {page} of {pages.toLocaleString()}</span><button disabled={page >= pages} type="button" onClick={() => changePage(page + 1)}>Next <ArrowRight size={16} /></button></nav>}</>}
    </div>
  </section>;
}
