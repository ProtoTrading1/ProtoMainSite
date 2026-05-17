import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Grip,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  PackagePlus,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  User,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  archiveProduct,
  createProduct,
  fetchAdminProductsPage,
  fetchDistinctCategories,
  fetchProductsByMainCategory,
  invalidateProductCache,
  updateProduct,
} from '../lib/products';
import { approveCustomer, deleteCustomer, fetchCustomersPage, updateCustomerAdmin } from '../lib/customers';
import { fetchAllOrdersAdmin, updateOrderAdmin } from '../lib/orders';
import categories from '../data/categories.json';

const sections = [
  { id: 'products', label: 'Product Manager', icon: PackagePlus },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'reorder', label: 'Reorder Grid', icon: Grip },
  { id: 'customers', label: 'Customer Management', icon: Users },
  { id: 'pricing', label: 'Pricing & Returns', icon: SlidersHorizontal },
  { id: 'orders', label: 'Order Requests', icon: ShoppingBag },
];

const orderStatuses = ['viewed', 'order in progress', 'awaiting payment', 'paid', 'delivered'];
const productTypes = ['General product', 'Hot seller', 'New stock', 'Clearance stock'];
const ADMIN_PAGE_SIZE = 50;
const CATEGORY_WORK_SIZE = 400;

const emptyForm = {
  code: '',
  name: '',
  image: '',
  price: '0',
  stockOnHand: '1',
  categoryId: categories[0]?.id || '',
  subcategoryId: categories[0]?.children?.[0]?.id || '',
  productType: 'General product',
};

function categoryLabel(id) {
  return categories.find((item) => item.id === id)?.label || id;
}

function subcategoryOptions(categoryId) {
  return categories.find((item) => item.id === categoryId)?.children || [];
}

function getProductType(product) {
  const badges = product.badges || [];
  if (badges.includes('Hot seller')) return 'Hot seller';
  if (product.isNew) return 'New stock';
  if (badges.includes('Clearance stock') || product.isSpecial) return 'Clearance stock';
  return 'General product';
}

function typePatch(type, product = {}) {
  const cleanBadges = (product.badges || []).filter((item) => !['Hot seller', 'Clearance stock'].includes(item));
  if (type === 'Hot seller') return { badges: [...cleanBadges, 'Hot seller'], isNew: false, isSpecial: false };
  if (type === 'New stock') return { badges: cleanBadges, isNew: true, isSpecial: false };
  if (type === 'Clearance stock') return { badges: [...cleanBadges, 'Clearance stock'], isNew: false, isSpecial: true, specialVisibility: 'all' };
  return { badges: cleanBadges, isNew: false, isSpecial: false };
}

function compactItems(items = []) {
  return items.map((item) => `${item.code} × ${item.qty}`).join(', ');
}

function csvDownload(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function productToForm(product) {
  return {
    code: product.code || '',
    name: product.name || '',
    image: product.image || '',
    price: String(product.price ?? 0),
    stockOnHand: String(product.stockOnHand ?? 1),
    categoryId: product.categoryPath?.[0] || categories[0]?.id || '',
    subcategoryId: product.categoryPath?.[1] || subcategoryOptions(product.categoryPath?.[0] || categories[0]?.id || '')[0]?.id || '',
    productType: getProductType(product),
  };
}

export default function AdminPage({ customer, onLogout, onViewPortal }) {
  const [activeSection, setActiveSection] = useState('products');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [liveCategories, setLiveCategories] = useState([]);
  const [saving, setSaving] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyForm);
  const [expandedCustomer, setExpandedCustomer] = useState(null);

  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [productPage, setProductPage] = useState(1);
  const [productRows, setProductRows] = useState([]);
  const [productTotal, setProductTotal] = useState(0);

  const [archiveSearch, setArchiveSearch] = useState('');
  const [archivePage, setArchivePage] = useState(1);
  const [archiveRows, setArchiveRows] = useState([]);
  const [archiveTotal, setArchiveTotal] = useState(0);

  const [customerTab, setCustomerTab] = useState('requests');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerRows, setCustomerRows] = useState([]);
  const [customerTotal, setCustomerTotal] = useState(0);

  const [pricingCategory, setPricingCategory] = useState(categories[0]?.id || '');
  const [pricingProducts, setPricingProducts] = useState([]);
  const [selectedPricing, setSelectedPricing] = useState([]);
  const [priceDelta, setPriceDelta] = useState('-10');

  const [reorderCategory, setReorderCategory] = useState(categories[0]?.id || '');
  const [reorderProducts, setReorderProducts] = useState([]);
  const [dragId, setDragId] = useState(null);

  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');

  const mainCategories = categories.map((item) => ({ id: item.id, label: item.label }));

  useEffect(() => {
    fetchDistinctCategories().then(setLiveCategories).catch(() => {});
  }, []);

  useEffect(() => { setProductPage(1); }, [productSearch, productCategory]);
  useEffect(() => { setArchivePage(1); }, [archiveSearch]);
  useEffect(() => { setCustomerPage(1); }, [customerTab, customerSearch]);

  const loadProducts = async () => {
    setLoadingProgress(0);
    try {
      const data = await fetchAdminProductsPage({ page: productPage, pageSize: ADMIN_PAGE_SIZE, searchQuery: productSearch, categoryFilter: productCategory, onProgress: setLoadingProgress });
      setProductRows(data.rows);
      setProductTotal(data.total);
    } finally { setLoadingProgress(null); }
  };

  const loadArchive = async () => {
    setLoadingProgress(0);
    try {
      const data = await fetchAdminProductsPage({ page: archivePage, pageSize: ADMIN_PAGE_SIZE, searchQuery: archiveSearch, zeroStockOnly: true, onProgress: setLoadingProgress });
      setArchiveRows(data.rows);
      setArchiveTotal(data.total);
    } finally { setLoadingProgress(null); }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomersPage({ page: customerPage, pageSize: ADMIN_PAGE_SIZE, tab: customerTab, searchQuery: customerSearch });
      setCustomerRows(data.rows);
      setCustomerTotal(data.total);
    } finally { setLoading(false); }
  };

  const loadCategoryWorkingSet = async (categoryId, target) => {
    setLoading(true);
    try {
      const rows = await fetchProductsByMainCategory(categoryId, { limit: CATEGORY_WORK_SIZE });
      if (target === 'pricing') setPricingProducts(rows);
      if (target === 'reorder') setReorderProducts(rows);
    } finally { setLoading(false); }
  };

  const loadOrders = async () => {
    setLoading(true);
    try { setOrders(await fetchAllOrdersAdmin(150)); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (activeSection === 'products') void loadProducts(); }, [activeSection, productPage, productSearch, productCategory]);
  useEffect(() => { if (activeSection === 'archive') void loadArchive(); }, [activeSection, archivePage, archiveSearch]);
  useEffect(() => { if (activeSection === 'customers') void loadCustomers(); }, [activeSection, customerPage, customerTab, customerSearch]);
  useEffect(() => { if (activeSection === 'pricing') void loadCategoryWorkingSet(pricingCategory, 'pricing'); }, [activeSection, pricingCategory]);
  useEffect(() => { if (activeSection === 'reorder') void loadCategoryWorkingSet(reorderCategory, 'reorder'); }, [activeSection, reorderCategory]);
  useEffect(() => { if (activeSection === 'orders' && orders.length === 0) void loadOrders(); }, [activeSection]);

  const stats = useMemo(() => ({
    products: productTotal,
    archived: archiveTotal,
    customers: customerTotal,
    premiumVisible: customerRows.filter((item) => item.tier === 'premium').length,
    orders: orders.length,
  }), [productTotal, archiveTotal, customerTotal, customerRows, orders]);

  const orderRows = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((order) => !q || [order.order_number, order.customers?.name, order.customers?.email, compactItems(order.original_items || order.items || [])].join(' ').toLowerCase().includes(q));
  }, [orders, orderSearch]);

  const openNewProduct = () => {
    const firstCategory = categories[0]?.id || '';
    setEditingProduct(null);
    setProductForm({ ...emptyForm, categoryId: firstCategory, subcategoryId: subcategoryOptions(firstCategory)[0]?.id || '' });
    setEditorOpen(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm(productToForm(product));
    setEditorOpen(true);
  };

  const closeEditor = () => { setEditorOpen(false); setEditingProduct(null); };

  const refreshCurrentSection = async () => {
    if (activeSection === 'products' || activeSection === 'archive') invalidateProductCache();
    if (activeSection === 'products') return loadProducts();
    if (activeSection === 'archive') return loadArchive();
    if (activeSection === 'customers') return loadCustomers();
    if (activeSection === 'pricing') return loadCategoryWorkingSet(pricingCategory, 'pricing');
    if (activeSection === 'reorder') return loadCategoryWorkingSet(reorderCategory, 'reorder');
    if (activeSection === 'orders') return loadOrders();
  };

  const saveProduct = async () => {
    const payload = {
      code: productForm.code.trim(),
      name: productForm.name.trim(),
      image: productForm.image.trim(),
      price: Number(productForm.price || 0),
      stockOnHand: Number(productForm.stockOnHand || 0),
      categoryPath: [productForm.categoryId, productForm.subcategoryId].filter(Boolean),
      ...typePatch(productForm.productType, editingProduct || {}),
    };
    setSaving(editingProduct?.id || 'new-product');
    try {
      await (editingProduct ? updateProduct(editingProduct.id, payload) : createProduct(payload));
      closeEditor();
      await loadProducts();
    } finally { setSaving(''); }
  };

  const toggleArchive = async (product) => {
    setSaving(product.id);
    try { await archiveProduct(product.id, !product.isArchived); await loadProducts(); }
    finally { setSaving(''); }
  };

  const toXlsxRow = (p) => ({
    Name: p.name,
    Barcode: p.barcode || p.code,
    'Website SKU': p.websiteSku || '',
    'Parent SKU': p.parentSku || '',
    Category: p.category || '',
    'Price (excl. VAT)': p.price,
    'Stock Qty': p.stockQty,
  });

  const exportLiveXlsx = async () => {
    setSaving('export-live');
    try {
      const data = await fetchAdminProductsPage({ page: 1, pageSize: 999999, searchQuery: productSearch, categoryFilter: productCategory });
      const ws = XLSX.utils.json_to_sheet(data.rows.map(toXlsxRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Live Products');
      XLSX.writeFile(wb, 'proto-live-products.xlsx');
    } finally { setSaving(''); }
  };

  const exportArchiveXlsx = async () => {
    setSaving('export-archive');
    try {
      const data = await fetchAdminProductsPage({ page: 1, pageSize: 999999, searchQuery: archiveSearch, zeroStockOnly: true });
      const ws = XLSX.utils.json_to_sheet(data.rows.map(toXlsxRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Archive 0 Stock');
      XLSX.writeFile(wb, 'proto-archive-products.xlsx');
    } finally { setSaving(''); }
  };

  const swapReorder = async (targetId) => {
    if (!dragId || dragId === targetId) return;
    const from = reorderProducts.find((item) => item.id === dragId);
    const to = reorderProducts.find((item) => item.id === targetId);
    if (!from || !to) return;
    setSaving('reorder');
    try {
      await Promise.all([updateProduct(from.id, { sortOrder: to.sortOrder }), updateProduct(to.id, { sortOrder: from.sortOrder })]);
      await loadCategoryWorkingSet(reorderCategory, 'reorder');
    } finally { setSaving(''); setDragId(null); }
  };

  const toggleSelectAllPricing = () => {
    if (selectedPricing.length === pricingProducts.length) return setSelectedPricing([]);
    setSelectedPricing(pricingProducts.map((item) => item.id));
  };

  const applyPricing = async () => {
    const delta = Number(priceDelta || 0);
    setSaving('pricing');
    try {
      const selected = pricingProducts.filter((product) => selectedPricing.includes(product.id));
      await Promise.all(selected.map((product) => updateProduct(product.id, { price: Number(((product.price || 0) * (1 + delta / 100)).toFixed(2)) })));
      await loadCategoryWorkingSet(pricingCategory, 'pricing');
    } finally { setSaving(''); }
  };

  const updateCustomer = async (person, patch) => {
    setSaving(person.id);
    try { await updateCustomerAdmin(person.id, patch); await loadCustomers(); }
    finally { setSaving(''); }
  };

  const approveRequest = async (person) => {
    setSaving(person.id);
    try { await approveCustomer(person.id, true); await loadCustomers(); setExpandedCustomer(null); }
    finally { setSaving(''); }
  };

  const removeCustomer = async (person) => {
    if (!window.confirm(`Delete ${person.name || person.email}? This cannot be undone.`)) return;
    setSaving(`del-${person.id}`);
    try { await deleteCustomer(person.id); await loadCustomers(); setExpandedCustomer(null); }
    finally { setSaving(''); }
  };

  const updateOrder = async (order, patch) => {
    setSaving(order.id);
    try {
      const updated = await updateOrderAdmin(order.id, patch);
      setOrders((prev) => prev.map((item) => item.id === order.id ? updated : item));
    } finally { setSaving(''); }
  };

  const productPages = Math.max(1, Math.ceil(productTotal / ADMIN_PAGE_SIZE));
  const customerPages = Math.max(1, Math.ceil(customerTotal / ADMIN_PAGE_SIZE));

  return (
    <div className="adm-shell">
      <header className="adm-header">
        <div className="adm-header-inner">
          <div className="adm-brand">
            <img src="/proto-logo.png" alt="Proto Trading" style={{ height: 32 }} />
            <div>
              <strong>PROTO <span style={{ color: '#8B1A1A' }}>TRADING</span></strong>
              <small>Admin portal</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => void refreshCurrentSection()} className="adm-btn-ghost"><RefreshCw size={15} /> Refresh</button>
            <button onClick={onViewPortal} className="adm-btn-ghost"><ArrowLeftRight size={15} /> Portal</button>
            <button onClick={onLogout} className="adm-btn-dark"><LogOut size={15} /> Log out</button>
          </div>
        </div>
      </header>

      <div className="adm-body">
        <div className="adm-stats-bar">
          <AdminStat label="Live Products" value={stats.products} />
          <AdminStat label="Archived" value={stats.archived} />
          <AdminStat label="Customers" value={stats.customers} />
          <AdminStat label="Orders" value={stats.orders} />
        </div>

        <div className="adm-layout">
          <aside className="adm-sidebar">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`adm-nav-btn${active ? ' adm-nav-btn--active' : ''}`}
                >
                  <Icon size={17} /> {section.label}
                </button>
              );
            })}
          </aside>

          <main className="adm-main">
            {loadingProgress !== null && (
              <div className="adm-progress-wrap">
                <div className="adm-progress-fill" style={{ width: `${loadingProgress}%` }} />
                <span className="adm-progress-label">{loadingProgress}%</span>
              </div>
            )}
            {loading && loadingProgress === null && (
              <div className="adm-loading-bar"><Loader2 size={16} className="spin" /> Loading…</div>
            )}

            {/* PRODUCTS */}
            {activeSection === 'products' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Product Manager</h2>
                    <p className="adm-section-note">Server-side paging — search and category filters load only what you need.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={openNewProduct} className="adm-btn-red"><PackagePlus size={15} /> Add product</button>
                    <button onClick={() => void exportLiveXlsx()} className="adm-btn-ghost">{saving === 'export-live' ? 'Exporting…' : 'Export Excel'}</button>
                  </div>
                </div>

                <div className="adm-toolbar">
                  <label className="adm-search"><Search size={15} /><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search by SKU or product name" className="adm-search-input" /></label>
                  <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} className="adm-select">
                    <option value="all">All categories</option>
                    {(liveCategories.length > 0 ? liveCategories : mainCategories.map((c) => c.label)).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="adm-list">
                  <div className="adm-list-head" style={{ gridTemplateColumns: '2fr 180px 100px' }}>
                    <span>Product</span><span>Stock</span><span>Actions</span>
                  </div>
                  {productRows.reduce((acc, product, i) => {
                    const cat = product.category || 'Uncategorized';
                    const prevCat = i > 0 ? (productRows[i - 1].category || 'Uncategorized') : null;
                    if (cat !== prevCat) {
                      acc.push(
                        <div key={`cat-${cat}`} className="adm-category-header">{cat}</div>
                      );
                    }
                    acc.push(
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '2fr 180px 100px' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{product.name}</div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>
                            <span title="Barcode (customer code)">BC: {product.barcode || product.code}</span>
                            {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                            {product.parentSku && <span title="Parent SKU" style={{ marginLeft: 8 }}>PSK: {product.parentSku}</span>}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700 }}>{product.stockQty != null ? `${product.stockQty} units` : '—'}</span>
                          {product.supplier && <div className="adm-muted" style={{ fontSize: 11 }}>{product.supplier}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditProduct(product)} className="adm-icon-btn"><Pencil size={14} /></button>
                          <button onClick={() => void toggleArchive(product)} className="adm-icon-btn">{product.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                        </div>
                      </div>
                    );
                    return acc;
                  }, [])}
                </div>
                <Pager page={productPage} totalPages={productPages} onChange={setProductPage} />
              </div>
            )}

            {/* ARCHIVE */}
            {activeSection === 'archive' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Archive — 0 Stock</h2>
                    <p className="adm-section-note">Products automatically moved here when stock hits exactly 0. Hidden from customers. Reappear when stock comes back in.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <button onClick={() => void exportArchiveXlsx()} className="adm-btn-ghost">{saving === 'export-archive' ? 'Exporting…' : 'Export Excel'}</button>
                    <span className="adm-pill" style={{ fontSize: 13, padding: '6px 14px' }}>{archiveTotal} products</span>
                  </div>
                </div>

                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr' }}>
                  <label className="adm-search"><Search size={15} /><input value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="Search archived products" className="adm-search-input" /></label>
                </div>

                {archiveRows.length === 0 && loadingProgress === null && (
                  <div className="adm-empty" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                    No products with 0 stock right now.
                  </div>
                )}

                <div className="adm-list">
                  {archiveRows.length > 0 && (
                    <div className="adm-list-head" style={{ gridTemplateColumns: '2fr 120px' }}>
                      <span>Product</span><span>Stock</span>
                    </div>
                  )}
                  {archiveRows.reduce((acc, product, i) => {
                    const cat = product.category || 'Uncategorized';
                    const prevCat = i > 0 ? (archiveRows[i - 1].category || 'Uncategorized') : null;
                    if (cat !== prevCat) {
                      acc.push(<div key={`cat-${cat}`} className="adm-category-header">{cat}</div>);
                    }
                    acc.push(
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '2fr 120px', opacity: 0.75 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{product.name}</div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>
                            <span title="Barcode">BC: {product.barcode || product.code}</span>
                            {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                            {product.parentSku && <span title="Parent SKU" style={{ marginLeft: 8 }}>PSK: {product.parentSku}</span>}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontWeight: 900, color: '#8B1A1A', fontSize: 15 }}>0</span>
                          <span className="adm-muted" style={{ fontSize: 11, marginLeft: 4 }}>units</span>
                        </div>
                      </div>
                    );
                    return acc;
                  }, [])}
                </div>
                <Pager page={archivePage} totalPages={Math.max(1, Math.ceil(archiveTotal / ADMIN_PAGE_SIZE))} onChange={setArchivePage} />
              </div>
            )}

            {/* REORDER */}
            {activeSection === 'reorder' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Reorder Grid</h2>
                    <p className="adm-section-note">Drag cards to reorder within the category. Loads one category at a time.</p>
                  </div>
                  <select value={reorderCategory} onChange={(e) => setReorderCategory(e.target.value)} className="adm-select">
                    {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {reorderProducts.map((product) => (
                    <div key={product.id} draggable onDragStart={() => setDragId(product.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => void swapReorder(product.id)} className="adm-reorder-card">
                      <div className="adm-thumb">{product.image ? <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="adm-muted">No image</span>}</div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{product.name}</div>
                      <div className="adm-muted">{product.code}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CUSTOMERS */}
            {activeSection === 'customers' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Customer Management</h2>
                    <p className="adm-section-note">50 customers per page. Customer requests show full application data.</p>
                  </div>
                </div>

                <div className="adm-customer-tabs">
                  <button onClick={() => setCustomerTab('requests')} className={`adm-tab${customerTab === 'requests' ? ' adm-tab--active' : ''}`}>Trade requests</button>
                  <button onClick={() => setCustomerTab('regular')} className={`adm-tab${customerTab === 'regular' ? ' adm-tab--active' : ''}`}>Approved</button>
                  <button onClick={() => setCustomerTab('premium')} className={`adm-tab${customerTab === 'premium' ? ' adm-tab--active' : ''}`}>Premium</button>
                  <label className="adm-search adm-search--inline"><Search size={14} /><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search…" className="adm-search-input" /></label>
                </div>

                {customerTab === 'requests' ? (
                  <div className="adm-requests-grid">
                    {customerRows.length === 0 && !loading && (
                      <div className="adm-empty">No pending trade requests.</div>
                    )}
                    {customerRows.map((person) => (
                      <div key={person.id} className="adm-request-card">
                        <div className="adm-request-card-body">
                          <div className="adm-request-avatar">
                            {(person.business_name || person.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="adm-request-info">
                            <div className="adm-request-biz">{person.business_name || person.name || 'Unknown business'}</div>
                            <div className="adm-request-contact">{person.name}</div>
                            <div className="adm-request-chips">
                              {person.country && <span className="adm-chip adm-chip--geo"><Globe size={11} />{person.country}{person.city ? `, ${person.city}` : ''}</span>}
                              {person.business_type && <span className="adm-chip adm-chip--type"><Store size={11} />{person.business_type}</span>}
                            </div>
                            <div className="adm-request-contact-row">
                              <span><Mail size={11} />{person.email}</span>
                              {person.phone && <span><Phone size={11} />{person.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="adm-request-actions">
                          <button onClick={() => setExpandedCustomer(person)} className="adm-btn-ghost adm-btn-sm">View details</button>
                          <button onClick={() => void approveRequest(person)} className="adm-btn-red adm-btn-sm" disabled={saving === person.id}>
                            {saving === person.id ? 'Approving…' : <><Check size={14} /> Approve</>}
                          </button>
                          <button onClick={() => void removeCustomer(person)} className="adm-btn-ghost adm-btn-sm" disabled={saving === `del-${person.id}`} style={{ color: '#c40000' }}>
                            {saving === `del-${person.id}` ? 'Deleting…' : <><X size={14} /> Delete</>}
                          </button>
                        </div>
                        <div className="adm-request-date">Applied {new Date(person.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="adm-list">
                    <div className="adm-list-head" style={{ gridTemplateColumns: '1.3fr 1.2fr 1fr 80px 110px 80px' }}>
                      <span>Name</span><span>Email</span><span>Phone</span><span>Orders</span><span>Tier</span><span></span>
                    </div>
                    {customerRows.map((person) => (
                      <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '1.3fr 1.2fr 1fr 80px 110px 80px' }}>
                        <span style={{ fontWeight: 700 }}>{person.name || 'Unnamed'}</span>
                        <span>{person.email}</span>
                        <span>{person.phone || '—'}</span>
                        <span>{person.orderCount}</span>
                        <button onClick={() => void updateCustomer(person, { tier: person.tier === 'premium' ? 'regular' : 'premium' })} className="adm-tier-btn adm-tier-btn--active">{person.tier === 'premium' ? 'Premium' : 'Regular'}</button>
                        <button onClick={() => void removeCustomer(person)} className="adm-btn-ghost adm-btn-sm" disabled={saving === `del-${person.id}`} style={{ color: '#c40000', padding: '4px 8px' }}>
                          {saving === `del-${person.id}` ? '…' : <X size={14} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Pager page={customerPage} totalPages={customerPages} onChange={setCustomerPage} />
              </div>
            )}

            {/* PRICING */}
            {activeSection === 'pricing' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Pricing & Returns</h2>
                    <p className="adm-section-note">Select products and apply a percentage price adjustment.</p>
                  </div>
                </div>
                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <select value={pricingCategory} onChange={(e) => { setPricingCategory(e.target.value); setSelectedPricing([]); }} className="adm-select">
                    {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <button onClick={toggleSelectAllPricing} className="adm-btn-ghost">{selectedPricing.length === pricingProducts.length ? 'Clear all' : 'Select all'}</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={priceDelta} onChange={(e) => setPriceDelta(e.target.value)} className="adm-tiny-input" placeholder="-10" />
                    <button onClick={() => void applyPricing()} className="adm-btn-red">{saving === 'pricing' ? 'Applying…' : 'Apply %'}</button>
                  </div>
                </div>
                <div className="adm-checkbox-list">
                  {pricingProducts.map((product) => (
                    <label key={product.id} className="adm-checkbox-row">
                      <input type="checkbox" checked={selectedPricing.includes(product.id)} onChange={(e) => setSelectedPricing((prev) => e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id))} />
                      <span style={{ fontWeight: 700 }}>{product.name}</span>
                      <small className="adm-muted">{product.code}</small>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ORDERS */}
            {activeSection === 'orders' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Order Requests</h2>
                    <p className="adm-section-note">Most recent 150 orders.</p>
                  </div>
                  <label className="adm-search"><Search size={15} /><input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search orders" className="adm-search-input" /></label>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {orderRows.map((order) => (
                    <div key={order.id} className="adm-order-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>{order.order_number || order.id.slice(0, 8)}</div>
                          <div className="adm-muted">{order.customers?.name || 'Unknown'} · {order.customers?.email || 'No email'}</div>
                        </div>
                        <select value={order.status || 'viewed'} onChange={(e) => void updateOrder(order, { status: e.target.value })} className="adm-select">
                          {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                        <div className="adm-subtle-box"><strong>Order placed</strong><div className="adm-muted">{compactItems(order.original_items || order.items || [])}</div></div>
                        <div className="adm-subtle-box"><strong>Order final</strong><div className="adm-muted">{compactItems(order.final_items || order.items || [])}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Customer detail drawer */}
      {expandedCustomer && (
        <div className="adm-drawer-backdrop" onClick={() => setExpandedCustomer(null)}>
          <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <h3>Application details</h3>
              <button onClick={() => setExpandedCustomer(null)} className="adm-icon-btn"><X size={16} /></button>
            </div>
            <div className="adm-drawer-body">
              <div className="adm-drawer-avatar">{(expandedCustomer.business_name || expandedCustomer.name || '?')[0].toUpperCase()}</div>
              <h2 className="adm-drawer-biz">{expandedCustomer.business_name || expandedCustomer.name}</h2>
              <div className="adm-drawer-fields">
                <DrawerField icon={User} label="Contact person" value={expandedCustomer.name} />
                <DrawerField icon={Mail} label="Email" value={expandedCustomer.email} />
                {expandedCustomer.phone && <DrawerField icon={Phone} label="Phone" value={expandedCustomer.phone} />}
                {expandedCustomer.country && <DrawerField icon={Globe} label="Country" value={expandedCustomer.country} />}
                {expandedCustomer.province && <DrawerField icon={MapPin} label="Province" value={expandedCustomer.province} />}
                {expandedCustomer.city && <DrawerField icon={MapPin} label="City" value={expandedCustomer.city} />}
                {expandedCustomer.business_type && <DrawerField icon={Store} label="Business type" value={expandedCustomer.business_type} />}
                <DrawerField icon={Building2} label="Applied" value={new Date(expandedCustomer.created_at).toLocaleString('en-ZA')} />
              </div>
            </div>
            <div className="adm-drawer-footer">
              <button onClick={() => setExpandedCustomer(null)} className="adm-btn-ghost">Cancel</button>
              <button onClick={() => void approveRequest(expandedCustomer)} className="adm-btn-red" disabled={saving === expandedCustomer.id}>
                {saving === expandedCustomer.id ? 'Approving…' : <><Check size={15} /> Approve trade access</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product editor modal */}
      {editorOpen && (
        <div className="adm-modal-backdrop">
          <div className="adm-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontFamily: 'Outfit, sans-serif' }}>{editingProduct ? 'Edit product' : 'Add product'}</h3>
                <p className="adm-muted" style={{ marginTop: 4 }}>Fill in the details and assign a category.</p>
              </div>
              <button onClick={closeEditor} className="adm-icon-btn"><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <AdminField label="Product code"><input value={productForm.code} onChange={(e) => setProductForm((p) => ({ ...p, code: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Product type">
                <select value={productForm.productType} onChange={(e) => setProductForm((p) => ({ ...p, productType: e.target.value }))} className="adm-field-input">
                  {productTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </AdminField>
              <AdminField label="Product name" full><input value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Image URL" full><input value={productForm.image} onChange={(e) => setProductForm((p) => ({ ...p, image: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Price"><input value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Stock on hand"><input value={productForm.stockOnHand} onChange={(e) => setProductForm((p) => ({ ...p, stockOnHand: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Main category">
                <select value={productForm.categoryId} onChange={(e) => setProductForm((p) => ({ ...p, categoryId: e.target.value, subcategoryId: subcategoryOptions(e.target.value)[0]?.id || '' }))} className="adm-field-input">
                  {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </AdminField>
              <AdminField label="Subcategory">
                <select value={productForm.subcategoryId} onChange={(e) => setProductForm((p) => ({ ...p, subcategoryId: e.target.value }))} className="adm-field-input">
                  {subcategoryOptions(productForm.categoryId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </AdminField>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={closeEditor} className="adm-btn-ghost"><ChevronLeft size={15} /> Cancel</button>
              <button onClick={() => void saveProduct()} className="adm-btn-red">
                {saving === 'new-product' || saving === editingProduct?.id ? 'Saving…' : <><Check size={15} /> Save product</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminField({ label, children, full = false }) {
  return (
    <label style={{ display: 'grid', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
      {children}
    </label>
  );
}

function DrawerField({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="adm-drawer-field">
      <Icon size={14} className="adm-drawer-field-icon" />
      <div>
        <div className="adm-drawer-field-label">{label}</div>
        <div className="adm-drawer-field-value">{value}</div>
      </div>
    </div>
  );
}

function AdminStat({ label, value, accent }) {
  return (
    <div className={`adm-stat${accent ? ' adm-stat--accent' : ''}`}>
      <div className="adm-stat-value">{value}</div>
      <div className="adm-stat-label">{label}</div>
    </div>
  );
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} className="adm-btn-ghost" disabled={page <= 1}><ChevronLeft size={15} /> Prev</button>
      <span className="adm-muted">Page {page} of {totalPages}</span>
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} className="adm-btn-ghost" disabled={page >= totalPages}>Next <ChevronRight size={15} /></button>
    </div>
  );
}
