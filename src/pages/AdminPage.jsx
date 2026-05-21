import { useEffect, useMemo, useRef, useState } from 'react';
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
  ImagePlus,
  Loader2,
  Upload,
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
  Star,
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
  invalidateAdminCache,
  invalidateProductCache,
  saveSortOrder,
  updateProduct,
} from '../lib/products';
import { approveCustomer, deleteCustomer, fetchCustomersPage, updateCustomerAdmin } from '../lib/customers';
import { fetchAllOrdersAdmin, updateOrderAdmin } from '../lib/orders';
import { fetchSpecials, saveSpecials } from '../lib/specials';
import categories from '../data/categories.json';

// ─── Reorder sort order — stored in localStorage, applied client-side ─────────
const SORT_STORE_KEY = 'proto_sort_v1';

function saveCategoryOrder(category, ids) {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_STORE_KEY) || '{}');
    all[category] = ids;
    localStorage.setItem(SORT_STORE_KEY, JSON.stringify(all));
  } catch {}
}

function loadCategoryOrder(category) {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_STORE_KEY) || '{}');
    return Array.isArray(all[category]) ? all[category] : null;
  } catch { return null; }
}

function applySavedOrder(products, category) {
  const saved = loadCategoryOrder(category);
  if (!saved || !saved.length) return products;
  const orderMap = new Map(saved.map((id, i) => [id, i]));
  return [...products].sort((a, b) => (orderMap.get(a.id) ?? 999999) - (orderMap.get(b.id) ?? 999999));
}

const sections = [
  { id: 'products', label: 'Product Manager', icon: PackagePlus },
  { id: 'specials', label: "This Week's Specials", icon: Star },
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
  const [loadingError, setLoadingError] = useState('');
  const [liveCategories, setLiveCategories] = useState([]);
  const [saving, setSaving] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyForm);
  const [expandedCustomer, setExpandedCustomer] = useState(null);

  const [contentEditProduct, setContentEditProduct] = useState(null);
  const [contentEditForm, setContentEditForm] = useState({ image: '', description: '' });
  const [contentEditSaving, setContentEditSaving] = useState(false);
  const [contentEditError, setContentEditError] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const imageFileInputRef = useRef(null);

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
  const [dragOverId, setDragOverId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');

  const [specials, setSpecials] = useState([]); // [{productId, productName, productCode, productImage, deal, discountPct, bogoX, bogoY}]
  const [specialsSaving, setSpecialsSaving] = useState(false);

  const mainCategories = categories.map((item) => ({ id: item.id, label: item.label }));

  useEffect(() => {
    fetchDistinctCategories().then(setLiveCategories).catch(() => {});
  }, []);

  useEffect(() => { setProductPage(1); }, [productSearch, productCategory]);
  useEffect(() => { setArchivePage(1); }, [archiveSearch]);
  useEffect(() => { setCustomerPage(1); }, [customerTab, customerSearch]);

  const loadProducts = async () => {
    setLoadingProgress(0);
    setLoadingError('');
    try {
      const data = await fetchAdminProductsPage({ page: productPage, pageSize: ADMIN_PAGE_SIZE, searchQuery: productSearch, categoryFilter: productCategory, onProgress: setLoadingProgress });
      setProductRows(data.rows);
      setProductTotal(data.total);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load products');
    } finally { setLoadingProgress(null); }
  };

  const loadArchive = async () => {
    setLoadingProgress(0);
    setLoadingError('');
    try {
      const data = await fetchAdminProductsPage({ page: archivePage, pageSize: ADMIN_PAGE_SIZE, searchQuery: archiveSearch, zeroStockOnly: true, onProgress: setLoadingProgress });
      setArchiveRows(data.rows);
      setArchiveTotal(data.total);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load archive');
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
      // Reorder shows the live site order (sort_order from DB) — no localStorage override
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

  // Load specials on mount
  useEffect(() => {
    fetchSpecials().then((data) => setSpecials(data?.items || [])).catch(() => {});
  }, []);

  const specialsSet = new Set(specials.map((s) => s.productId));

  const toggleSpecial = async (product) => {
    let next;
    if (specialsSet.has(product.id)) {
      next = specials.filter((s) => s.productId !== product.id);
    } else {
      if (specials.length >= 10) { alert('Maximum 10 specials allowed. Remove one first.'); return; }
      next = [...specials, { productId: product.id, productName: product.name, productCode: product.code, productImage: product.image || '', deal: 'none', discountPct: 10, bogoX: 1, bogoY: 1 }];
    }
    setSpecials(next);
    setSpecialsSaving(true);
    try { await saveSpecials(next); } catch { /* silent */ } finally { setSpecialsSaving(false); }
  };

  const updateSpecialDeal = async (productId, patch) => {
    const next = specials.map((s) => s.productId === productId ? { ...s, ...patch } : s);
    setSpecials(next);
    setSpecialsSaving(true);
    try { await saveSpecials(next); } catch { /* silent */ } finally { setSpecialsSaving(false); }
  };

  const clearAllSpecials = async () => {
    if (!window.confirm('Remove all specials?')) return;
    setSpecials([]);
    setSpecialsSaving(true);
    try { await saveSpecials([]); } catch { /* silent */ } finally { setSpecialsSaving(false); }
  };

  const uploadImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setContentEditError('Only image files are supported.');
      return;
    }
    setImageUploading(true);
    setContentEditError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, base64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setContentEditForm((f) => ({ ...f, image: json.url }));
    } catch (err) {
      setContentEditError(err.message || 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
  };

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

  const openContentEdit = (product) => {
    setContentEditProduct(product);
    setContentEditForm({ image: product.image || '', description: product.description || '' });
    setContentEditError('');
  };

  const closeContentEdit = () => { setContentEditProduct(null); setContentEditError(''); };

  const saveContentEdit = async () => {
    if (!contentEditProduct) return;
    setContentEditSaving(true);
    setContentEditError('');
    try {
      await updateProduct(contentEditProduct.id, {
        image: contentEditForm.image.trim(),
        description: contentEditForm.description,
      });
      // Update local lists so image/description reflects the change without a full reload
      const patch = { image: contentEditForm.image.trim(), description: contentEditForm.description };
      setProductRows((prev) => prev.map((p) => p.id === contentEditProduct.id ? { ...p, ...patch } : p));
      setReorderProducts((prev) => prev.map((p) => p.id === contentEditProduct.id ? { ...p, ...patch } : p));
      closeContentEdit();
    } catch (err) {
      setContentEditError(err.message || 'Save failed');
    } finally {
      setContentEditSaving(false);
    }
  };

  const refreshCurrentSection = async () => {
    if (activeSection === 'products' || activeSection === 'archive') invalidateAdminCache();
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

  const toggleSelectReorder = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistOrder = (next) => {
    const updates = next.map((p, i) => ({ websiteSku: p.id, sortOrder: i + 1 }));
    saveSortOrder(updates).catch(console.error);
  };

  const moveSelectedToTop = () => {
    if (!selectedIds.size) return;
    setReorderProducts((prev) => {
      const moving = prev.filter((p) => selectedIds.has(p.id));
      const rest = prev.filter((p) => !selectedIds.has(p.id));
      const next = [...moving, ...rest];
      persistOrder(next);
      return next;
    });
    setSelectedIds(new Set());
  };

  const dropToTop = () => {
    setDragOverId(null);
    if (!dragId) return;
    setReorderProducts((prev) => {
      const toMove = selectedIds.has(dragId) ? selectedIds : new Set([dragId]);
      const moving = prev.filter((p) => toMove.has(p.id));
      const rest = prev.filter((p) => !toMove.has(p.id));
      const next = [...moving, ...rest];
      persistOrder(next);
      return next;
    });
    setDragId(null);
  };

  const swapReorder = (targetId) => {
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    setReorderProducts((prev) => {
      const toMove = selectedIds.has(dragId) ? selectedIds : new Set([dragId]);
      if (toMove.has(targetId)) return prev;
      const moving = prev.filter((p) => toMove.has(p.id));
      const rest = prev.filter((p) => !toMove.has(p.id));
      const insertAt = rest.findIndex((p) => p.id === targetId);
      if (insertAt < 0) return prev;
      const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
      persistOrder(next);
      return next;
    });
    setDragId(null);
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
            {loadingError && (
              <div style={{ margin: '12px 0', padding: '10px 16px', background: '#fef2f2', borderRadius: 8, color: '#c40000', fontSize: 13, fontWeight: 600 }}>
                Error: {loadingError}
              </div>
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
                  <div className="adm-list-head" style={{ gridTemplateColumns: '2fr 180px 120px' }}>
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
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '2fr 180px 120px' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {product.name}
                            {!product.image && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>No image</span>}
                            {specialsSet.has(product.id) && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#8B1A1A', borderRadius: 4, padding: '1px 5px' }}>Special</span>}
                          </div>
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
                          <button
                            onClick={() => void toggleSpecial(product)}
                            className="adm-icon-btn"
                            title={specialsSet.has(product.id) ? 'Remove from specials' : 'Add to specials'}
                          >
                            <Star size={14} className={specialsSet.has(product.id) ? 'star-spinning' : ''} style={{ color: specialsSet.has(product.id) ? '#f59e0b' : undefined }} />
                          </button>
                          <button onClick={() => openEditProduct(product)} className="adm-icon-btn" title="Edit product details"><Pencil size={14} /></button>
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

            {/* THIS WEEK'S SPECIALS */}
            {activeSection === 'specials' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Star size={20} style={{ color: '#f59e0b' }} /> This Week's Specials
                    </h2>
                    <p className="adm-section-note">Max 10 specials. Star a product in Product Manager to add it here. Configure the deal type for each.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {specialsSaving && <span className="adm-muted" style={{ fontSize: 12 }}>Saving…</span>}
                    {specials.length > 0 && (
                      <button onClick={() => void clearAllSpecials()} className="adm-btn-ghost" style={{ color: '#c40000' }}>
                        Clear all
                      </button>
                    )}
                    <span className="adm-pill">{specials.length} / 10</span>
                  </div>
                </div>

                {specials.length === 0 && (
                  <div className="adm-empty" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
                    <Star size={36} style={{ color: '#d1d5db', marginBottom: 12 }} />
                    <p style={{ margin: 0 }}>No specials yet. Go to <strong>Product Manager</strong> and click the ☆ star on any product to add it here.</p>
                  </div>
                )}

                {specials.length > 0 && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {specials.map((item) => (
                      <div key={item.productId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start', padding: '16px', background: '#fafafa', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Star size={14} className="star-spinning" />
                            {item.productName}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>{item.productCode}</div>

                          {/* Deal selector */}
                          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                              <span style={{ fontWeight: 600 }}>Deal:</span>
                              <select
                                value={item.deal || 'none'}
                                onChange={(e) => void updateSpecialDeal(item.productId, { deal: e.target.value })}
                                className="adm-select"
                                style={{ fontSize: 12, padding: '4px 8px' }}
                              >
                                <option value="none">No deal — just featured</option>
                                <option value="discount">Discount %</option>
                                <option value="bogo">Buy X Get Y Free</option>
                              </select>
                            </label>

                            {item.deal === 'discount' && (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <span style={{ fontWeight: 600 }}>Discount:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  value={item.discountPct || 10}
                                  onChange={(e) => void updateSpecialDeal(item.productId, { discountPct: Number(e.target.value) })}
                                  className="adm-tiny-input"
                                  style={{ width: 56 }}
                                />
                                <span className="adm-muted">%</span>
                              </label>
                            )}

                            {item.deal === 'bogo' && (
                              <>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                  <span style={{ fontWeight: 600 }}>Buy</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={item.bogoX || 1}
                                    onChange={(e) => void updateSpecialDeal(item.productId, { bogoX: Number(e.target.value) })}
                                    className="adm-tiny-input"
                                    style={{ width: 48 }}
                                  />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                  <span style={{ fontWeight: 600 }}>Get</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={item.bogoY || 1}
                                    onChange={(e) => void updateSpecialDeal(item.productId, { bogoY: Number(e.target.value) })}
                                    className="adm-tiny-input"
                                    style={{ width: 48 }}
                                  />
                                  <span style={{ fontWeight: 600 }}>Free</span>
                                </label>
                              </>
                            )}

                            {/* Preview badge */}
                            <span style={{ marginLeft: 'auto', background: '#8B1A1A', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {item.deal === 'discount' ? `${item.discountPct || 10}% OFF`
                                : item.deal === 'bogo' ? `Buy ${item.bogoX || 1} Get ${item.bogoY || 1} Free`
                                : "This Week's Special"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => void toggleSpecial({ id: item.productId, name: item.productName, code: item.productCode, image: item.productImage })}
                          className="adm-icon-btn"
                          title="Remove from specials"
                          style={{ color: '#c40000', marginTop: 2 }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                    <p className="adm-section-note">Live reflection of the site. Drag to reorder — changes save to the database immediately.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedIds.size > 0 && (
                      <>
                        <span className="adm-pill">{selectedIds.size} selected</span>
                        <button onClick={moveSelectedToTop} className="adm-btn-red">Move to top</button>
                        <button onClick={() => setSelectedIds(new Set())} className="adm-btn-ghost">Clear</button>
                      </>
                    )}
                    <select value={reorderCategory} onChange={(e) => { setSelectedIds(new Set()); setReorderCategory(e.target.value); }} className="adm-select">
                      {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                    <button
                      onClick={() => { setSelectedIds(new Set()); invalidateAdminCache(); void loadCategoryWorkingSet(reorderCategory, 'reorder'); }}
                      className="adm-btn-ghost"
                      title="Reload from site"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Top drop zone — visible whenever a drag is in progress */}
                <div
                  onDragEnter={(e) => { e.preventDefault(); setDragOverId('__top__'); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null); }}
                  onDrop={(e) => { e.preventDefault(); dropToTop(); }}
                  className={`adm-reorder-top-zone${dragId ? ' adm-reorder-top-zone--visible' : ''}${dragOverId === '__top__' ? ' adm-reorder-top-zone--over' : ''}`}
                >
                  ↑ Drop here to move to top
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {reorderProducts.map((product) => {
                    const isDragging = dragId === product.id;
                    const isOver = dragOverId === product.id && !isDragging;
                    const isSelected = selectedIds.has(product.id);
                    return (
                      <div
                        key={product.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(product.id); }}
                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                        onDragEnter={(e) => { e.preventDefault(); if (product.id !== dragId) setDragOverId(product.id); }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null); }}
                        onDrop={(e) => { e.preventDefault(); swapReorder(product.id); }}
                        className={`adm-reorder-card${isDragging ? ' adm-reorder-card--dragging' : ''}${isOver ? ' adm-reorder-card--over' : ''}${isSelected ? ' adm-reorder-card--selected' : ''}`}
                      >
                        <div className="adm-reorder-handle">
                          {/* onMouseDown stops the parent drag from starting when the checkbox is clicked */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectReorder(product.id)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer', accentColor: '#8B1A1A' }}
                          />
                          <Grip size={14} />
                          <span className="adm-muted" style={{ fontSize: 10 }}>{isSelected ? 'selected' : 'drag to reorder'}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openContentEdit(product); }}
                            className="adm-icon-btn"
                            title="Edit image & description"
                          >
                            <ImagePlus size={13} />
                          </button>
                        </div>
                        <div className="adm-thumb">{product.image ? <img src={product.image} alt={product.name} style={{ maxWidth: '90%', maxHeight: '90%', width: 'auto', height: 'auto', objectFit: 'contain', mixBlendMode: 'multiply' }} /> : <span className="adm-muted">No image</span>}</div>
                        <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8 }}>{product.name}</div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>{product.code}</div>
                      </div>
                    );
                  })}
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

      {/* Content quick-edit modal (image drag-drop + description) */}
      {contentEditProduct && (
        <div className="adm-modal-backdrop">
          <div className="adm-modal" style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif' }}>Edit image & description</h3>
                <p className="adm-muted" style={{ marginTop: 4, fontSize: 13 }}>{contentEditProduct.name}</p>
              </div>
              <button onClick={closeContentEdit} className="adm-icon-btn"><X size={16} /></button>
            </div>

            {/* Hidden file input */}
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImageFile(f); e.target.value = ''; }}
            />

            {/* Drop zone / preview */}
            <div
              onClick={() => !imageUploading && imageFileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); setImageDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setImageDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setImageDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadImageFile(file);
              }}
              style={{
                position: 'relative',
                marginBottom: 12,
                borderRadius: 10,
                border: `2px dashed ${imageDragOver ? '#8B1A1A' : contentEditForm.image ? '#d1d5db' : '#cbd5e1'}`,
                background: imageDragOver ? '#fff5f5' : contentEditForm.image ? '#f8f8f8' : '#f8fafc',
                height: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: imageUploading ? 'wait' : 'pointer',
                overflow: 'hidden',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {imageUploading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#8B1A1A' }}>
                  <Loader2 size={32} className="spin" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Uploading…</span>
                </div>
              ) : contentEditForm.image ? (
                <>
                  <img
                    src={contentEditForm.image}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: imageDragOver ? 'flex' : 'none',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#fff',
                  }}>
                    <Upload size={28} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Drop to replace</span>
                  </div>
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '6px 10px', background: 'rgba(0,0,0,0.5)',
                    color: '#fff', fontSize: 11, textAlign: 'center',
                    display: imageDragOver ? 'none' : 'block',
                  }}>
                    Click or drag a new image to replace
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: imageDragOver ? '#8B1A1A' : '#94a3b8', pointerEvents: 'none' }}>
                  <Upload size={32} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Drag & drop an image here</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>or click to browse files</div>
                  </div>
                </div>
              )}
            </div>

            {/* Manual URL input */}
            <label style={{ display: 'grid', gap: 5, marginBottom: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or paste image URL</span>
              <input
                value={contentEditForm.image}
                onChange={(e) => setContentEditForm((f) => ({ ...f, image: e.target.value }))}
                className="adm-field-input"
                placeholder="https://example.com/product.jpg"
                style={{ fontSize: 12 }}
              />
            </label>

            {/* Description */}
            <label style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Description</span>
              <textarea
                value={contentEditForm.description}
                onChange={(e) => setContentEditForm((f) => ({ ...f, description: e.target.value }))}
                className="adm-field-input"
                rows={4}
                placeholder="Product description shown to customers…"
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </label>

            {contentEditError && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, color: '#c40000', fontSize: 13 }}>
                {contentEditError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={closeContentEdit} className="adm-btn-ghost"><ChevronLeft size={15} /> Cancel</button>
              <button onClick={() => void saveContentEdit()} className="adm-btn-red" disabled={contentEditSaving || imageUploading}>
                {contentEditSaving ? 'Saving…' : <><Check size={15} /> Save to Supabase</>}
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
