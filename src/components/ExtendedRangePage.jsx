import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, PackageSearch, RefreshCw, Search, Store, X } from 'lucide-react';
import ProductCard from './ProductCard';
import ProtoLogo from './ProtoLogo';
import { fetchExtendedRange, instoreCatalogue, prefetchInstoreCatalogue, storedExtendedRange } from '../lib/extendedRange';
import { discoveryTiles } from '../../lib/instore-discovery.mjs';
import { INSTORE_PAGE_SIZE, instorePage } from '../../lib/instore-page.mjs';
import './InstoreProducts.css';
import './InstoreDisclaimer.css';

const PAGE_SIZE = INSTORE_PAGE_SIZE;

export default function ExtendedRangePage({ addToCart, cartQtyMap = {}, cartPreferenceMap = {}, specialsMap = {}, browseCategory = '', onBrowseCategoryChange }) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE });
  const [tiles, setTiles] = useState([]);
  // The complete collection, once it has been fetched in the background. While
  // it is held, every search, category and page is answered without a request.
  const [catalogue, setCatalogue] = useState(() => instoreCatalogue());
  // Beads stays the first browse tile, but opening the page must show the
  // complete collection rather than silently applying that tile as a filter.
  const [category, setCategory] = useState(browseCategory);
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const resultsRef = useRef(null);
  const searchRef = useRef(null);

  const localTiles = useMemo(() => (catalogue ? discoveryTiles(catalogue) : null), [catalogue]);

  // Once the collection is in memory, a search, a category tile or a page
  // button is answered here: no request, no spinner.
  useEffect(() => {
    if (!catalogue) return;
    // instorePage is the API's own page definition, applied to the same
    // already-verified products it sent, so a locally answered view is the
    // view the server would have returned.
    const view = instorePage(catalogue, { query: submittedQuery, category, page, pageSize: PAGE_SIZE });
    setProducts(view.products);
    setTiles(localTiles || []);
    setMeta({ total: view.total, page, pageSize: PAGE_SIZE });
    setError(false);
    setLoading(false);
  }, [catalogue, localTiles, submittedQuery, category, page]);

  useEffect(() => {
    if (catalogue) return undefined;
    const controller = new AbortController();
    const apply = (data) => {
      setProducts(Array.isArray(data?.products) ? data.products : []);
      setTiles(Array.isArray(data?.tiles) ? data.tiles : []);
      setMeta({ total: Math.max(0, Number(data?.total) || 0), page: Number(data?.page) || page, pageSize: Math.max(1, Number(data?.pageSize) || PAGE_SIZE) });
    };
    // A view this tab has already seen is painted at once and replaced as soon
    // as the fresh response lands, so returning to Instore Products does not
    // start again from an empty grid.
    const stored = storedExtendedRange(submittedQuery, { page, category });
    if (stored) apply(stored);
    setLoading(!stored); setError(false);
    fetchExtendedRange(submittedQuery, { signal: controller.signal, page, category })
      .then((data) => {
        if (controller.signal.aborted) return;
        apply(data);
      })
      .catch(() => { if (!controller.signal.aborted && !stored) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [submittedQuery, page, retry, category, catalogue]);

  // Portal boot already starts this collection, so usually it is in hand
  // before this page is opened. Joining the same load covers a customer who
  // arrives before it has finished, or whose boot prefetch did not run.
  useEffect(() => {
    if (catalogue) return undefined;
    let cancelled = false;
    prefetchInstoreCatalogue().then((collection) => {
      if (!cancelled && collection) setCatalogue(collection);
    });
    return () => { cancelled = true; };
  }, [catalogue, retry]);

  // The app router owns the hash. Mirroring its parsed browse value here
  // prevents a native category link from leaving this page on stale results.
  useEffect(() => {
    setCategory(browseCategory);
    setPage(1);
    if (browseCategory) window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [browseCategory]);

  const preferenceFor = (id) => Object.hasOwn(preferences, id) ? preferences[id] : (cartPreferenceMap[id] || '');
  const choose = (value, nextCategory = category) => { setQuery(value); setSubmittedQuery(value); setCategory(nextCategory); setPage(1); };

  // A typed search is a fresh discovery task, not an extra hidden category
  // constraint. Category tiles remain a separate, explicit filter.
  const submit = (event) => { event.preventDefault(); setSubmittedQuery(query.trim()); setCategory(''); onBrowseCategoryChange?.(''); setPage(1); };
  const clear = () => { setQuery(''); setSubmittedQuery(''); setCategory(''); onBrowseCategoryChange?.(''); setPage(1); searchRef.current?.focus(); };
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
    {!submittedQuery && tiles.length > 0 && <section className="instore-browse" aria-label="Browse product types">
      <div className="instore-browse-heading"><strong>Browse by category</strong><span>Filter the collection, or continue with all products below.</span></div>
      <nav className="instore-tiles instore-tiles--rail" aria-label="Browse by product type">{tiles.map((tile) => {
      const active = category === tile.label;
      const href = active ? '#/instore-products' : `#/instore-products?browse=${encodeURIComponent(tile.label)}`;
      return <a key={tile.label} href={href} data-category={tile.label} data-active={active} aria-current={active ? 'page' : undefined} aria-label={`Show ${tile.count.toLocaleString()} ${tile.label} products`}><img src={tile.image} alt="" /><span>{tile.label}<small>{tile.count.toLocaleString()} products</small></span><ArrowRight size={16} /></a>;
    })}</nav>
    </section>}
    <div ref={resultsRef} className="instore-results" tabIndex={-1} aria-busy={loading}>
      <p className="instore-summary" role="status" aria-live="polite">{loading ? 'Loading Instore Products…' : error ? 'Products could not be loaded.' : products.length ? `${first.toLocaleString()}–${last.toLocaleString()} of ${meta.total.toLocaleString()} products${submittedQuery ? ` for “${submittedQuery}”` : ''}` : submittedQuery ? `No results for “${submittedQuery}”` : 'The collection is currently empty.'}</p>
      {loading && <div className="instore-loading" role="status"><span className="instore-spinner" aria-hidden="true"><ProtoLogo variant="icon" size={32} tagline={false} /></span><span>Searching products…</span></div>}
      {!loading && error && <div className="instore-state" role="alert"><RefreshCw size={28} /><h3>Let’s try that again</h3><p>We couldn’t load Instore Products. Your basket has not changed.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
      {!loading && !error && !products.length && <div className="instore-state"><PackageSearch size={30} /><h3>No products found</h3><p>Try a shorter name or a different word.</p><button type="button" onClick={clear}>Clear search</button></div>}
      {!loading && !error && products.length > 0 && <><div className="instore-grid">{products.map((product, index) => <article key={product.id} className="instore-item"><ProductCard product={product} addToCart={(item, qty, point) => { addToCart(item, qty, point, preferenceFor(product.id)); setPreferences((current) => ({ ...current, [product.id]: '' })); }} cartQty={cartQtyMap[product.id] || 0} special={specialsMap[product.id] || null} priority={index < 4} preferenceSlot={<label className="instore-preference instore-preference--in-card">Preferred colour/design <small>(optional)</small><textarea value={preferenceFor(product.id)} onChange={(event) => setPreferences((current) => ({ ...current, [product.id]: event.target.value }))} maxLength={240} rows={2} placeholder="e.g. dark brown, if available" /><span>Subject to availability. Your preference will accompany this item.</span></label>} /></article>)}</div>{pages > 1 && <nav className="instore-pagination" aria-label="Product pages"><button disabled={page <= 1} type="button" onClick={() => changePage(page - 1)}><ArrowLeft size={16} /> Previous</button><span>Page {page} of {pages.toLocaleString()}</span><button disabled={page >= pages} type="button" onClick={() => changePage(page + 1)}>Next <ArrowRight size={16} /></button></nav>}</>}
    </div>

  </section>;
}
