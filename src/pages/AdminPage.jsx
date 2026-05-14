import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Grip,
  Loader2,
  LogOut,
  PackagePlus,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import {
  archiveProduct,
  bulkUpsertProducts,
  createProduct,
  exportProductsCsv,
  fetchAdminProductsPage,
  fetchProductsByMainCategory,
  updateProduct,
} from '../lib/products';
import { approveCustomer, fetchCustomersPage, updateCustomerAdmin } from '../lib/customers';
import { fetchAllOrdersAdmin, updateOrderAdmin } from '../lib/orders';
import categories from '../data/categories.json';

const sections = [
  { id: 'products', label: 'Product Manager', icon: PackagePlus },
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyForm);

  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [productPage, setProductPage] = useState(1);
  const [productRows, setProductRows] = useState([]);
  const [productTotal, setProductTotal] = useState(0);

  const [customerTab, setCustomerTab] = useState('regular');
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

  useEffect(() => { setProductPage(1); }, [productSearch, productCategory]);
  useEffect(() => { setCustomerPage(1); }, [customerTab, customerSearch]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminProductsPage({
        page: productPage,
        pageSize: ADMIN_PAGE_SIZE,
        searchQuery: productSearch,
        mainCategory: productCategory,
      });
      setProductRows(data.rows);
      setProductTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomersPage({
        page: customerPage,
        pageSize: ADMIN_PAGE_SIZE,
        tab: customerTab,
        searchQuery: customerSearch,
      });
      setCustomerRows(data.rows);
      setCustomerTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryWorkingSet = async (categoryId, target) => {
    setLoading(true);
    try {
      const rows = await fetchProductsByMainCategory(categoryId, { limit: CATEGORY_WORK_SIZE });
      if (target === 'pricing') setPricingProducts(rows);
      if (target === 'reorder') setReorderProducts(rows);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      setOrders(await fetchAllOrdersAdmin(150));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'products') void loadProducts();
  }, [activeSection, productPage, productSearch, productCategory]);

  useEffect(() => {
    if (activeSection === 'customers') void loadCustomers();
  }, [activeSection, customerPage, customerTab, customerSearch]);

  useEffect(() => {
    if (activeSection === 'pricing') void loadCategoryWorkingSet(pricingCategory, 'pricing');
  }, [activeSection, pricingCategory]);

  useEffect(() => {
    if (activeSection === 'reorder') void loadCategoryWorkingSet(reorderCategory, 'reorder');
  }, [activeSection, reorderCategory]);

  useEffect(() => {
    if (activeSection === 'orders' && orders.length === 0) void loadOrders();
  }, [activeSection]);

  const stats = useMemo(() => ({
    products: productTotal,
    customers: customerTotal,
    premiumVisible: customerRows.filter((item) => item.tier === 'premium').length,
    orders: orders.length,
  }), [productTotal, customerTotal, customerRows, orders]);

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

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingProduct(null);
  };

  const refreshCurrentSection = async () => {
    if (activeSection === 'products') return loadProducts();
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
    } finally {
      setSaving('');
    }
  };

  const toggleArchive = async (product) => {
    setSaving(product.id);
    try {
      await archiveProduct(product.id, !product.isArchived);
      await loadProducts();
    } finally {
      setSaving('');
    }
  };

  const seedFromCatalogue = async () => {
    setSaving('seed');
    try {
      const response = await fetch('/stockProducts.json');
      const json = await response.json();
      for (let index = 0; index < json.length; index += 500) {
        const batch = json.slice(index, index + 500).map((item, offset) => ({
          code: item.code,
          name: item.name,
          image: item.image || '',
          price: item.price ?? 0,
          stockOnHand: item.stockOnHand ?? 1,
          categoryPath: item.categoryPath || [],
          tags: item.tags || [],
          badges: item.badges || [],
          isNew: item.isNew || false,
          isSpecial: item.isSpecial || false,
          sortOrder: index + offset,
          tradeNote: item.tradeNote || '',
          marginCue: item.marginCue || '',
        }));
        await bulkUpsertProducts(batch);
      }
      await loadProducts();
    } finally {
      setSaving('');
    }
  };

  const exportProducts = async () => {
    setSaving('export');
    try {
      const rows = await exportProductsCsv();
      csvDownload(rows, 'proto-products-export.csv');
    } finally {
      setSaving('');
    }
  };

  const swapReorder = async (targetId) => {
    if (!dragId || dragId === targetId) return;
    const from = reorderProducts.find((item) => item.id === dragId);
    const to = reorderProducts.find((item) => item.id === targetId);
    if (!from || !to) return;

    setSaving('reorder');
    try {
      await Promise.all([
        updateProduct(from.id, { sortOrder: to.sortOrder }),
        updateProduct(to.id, { sortOrder: from.sortOrder }),
      ]);
      await loadCategoryWorkingSet(reorderCategory, 'reorder');
    } finally {
      setSaving('');
      setDragId(null);
    }
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
    } finally {
      setSaving('');
    }
  };

  const updateCustomer = async (person, patch) => {
    setSaving(person.id);
    try {
      await updateCustomerAdmin(person.id, patch);
      await loadCustomers();
    } finally {
      setSaving('');
    }
  };

  const approveRequest = async (person) => {
    setSaving(person.id);
    try {
      await approveCustomer(person.id, true);
      await loadCustomers();
    } finally {
      setSaving('');
    }
  };

  const updateOrder = async (order, patch) => {
    setSaving(order.id);
    try {
      const updated = await updateOrderAdmin(order.id, patch);
      setOrders((prev) => prev.map((item) => item.id === order.id ? updated : item));
    } finally {
      setSaving('');
    }
  };

  const productPages = Math.max(1, Math.ceil(productTotal / ADMIN_PAGE_SIZE));
  const customerPages = Math.max(1, Math.ceil(customerTotal / ADMIN_PAGE_SIZE));

  return (
    <div style={shell}>
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={heroCard}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fecaca', fontWeight: 700, marginBottom: 10 }}>
              <Shield size={18} /> Authorised admin only
            </div>
            <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 34 }}>Proto admin command centre</h1>
            <p style={{ margin: '8px 0 0', color: '#cbd5e1', maxWidth: 760 }}>
              Faster admin loading: each section now loads only the data it needs instead of dragging the whole database into the browser.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onViewPortal} style={whiteGhost}><ArrowLeftRight size={16} /> View portal</button>
            <button onClick={() => void refreshCurrentSection()} style={whiteGhost}><RefreshCw size={16} /> Refresh</button>
            <button onClick={onLogout} style={redButton}><LogOut size={16} /> Log out</button>
          </div>
        </div>

        <div style={statsGrid}>
          <Stat label="Products in current filter" value={stats.products} />
          <Stat label="Customers in current tab" value={stats.customers} />
          <Stat label="Premium on page" value={stats.premiumVisible} />
          <Stat label="Orders loaded" value={stats.orders} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
          <aside style={sidebarCard}>
            {sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <button key={section.id} onClick={() => setActiveSection(section.id)} style={{ ...sideButton, ...(active ? sideButtonActive : {}) }}>
                  <Icon size={18} /> {section.label}
                </button>
              );
            })}
          </aside>

          <main style={{ display: 'grid', gap: 20 }}>
            {loading ? <div style={panel}><Loader2 size={18} className="spin" /> Loading section data…</div> : null}

            {activeSection === 'products' ? (
              <section style={panelBlock}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={sectionTitle}>Product Manager</h2>
                    <p style={sectionNote}>Now paged server-side for speed. Search and category filters only load the slice you need.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={openNewProduct} style={redButton}><PackagePlus size={16} /> Add product</button>
                    <button onClick={() => void seedFromCatalogue()} style={darkButton}>Seed current catalogue</button>
                    <button onClick={() => void exportProducts()} style={ghostButton}>Export CSV</button>
                  </div>
                </div>

                <div style={toolbarGrid}>
                  <label style={searchWrap}><Search size={16} /><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search by SKU or product name" style={inputBare} /></label>
                  <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} style={selectStyle}>
                    <option value="all">All main categories</option>
                    {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>

                <div style={listWrap}>
                  <div style={listHead}>
                    <span>Product</span>
                    <span>Main category</span>
                    <span>Type</span>
                    <span>Actions</span>
                  </div>
                  {productRows.map((product) => (
                    <div key={product.id} style={listRow}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{product.name}</div>
                        <div style={mutedSmall}>{product.code}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{categoryLabel(product.categoryPath?.[0])}</div>
                        <div style={mutedSmall}>{subcategoryOptions(product.categoryPath?.[0]).find((item) => item.id === product.categoryPath?.[1])?.label || 'No subcategory'}</div>
                      </div>
                      <div><span style={pill}>{getProductType(product)}</span></div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => openEditProduct(product)} style={iconButton}><Pencil size={15} /></button>
                        <button onClick={() => void toggleArchive(product)} style={iconButton}>{product.isArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pager page={productPage} totalPages={productPages} onChange={setProductPage} />
              </section>
            ) : null}

            {activeSection === 'reorder' ? (
              <section style={panelBlock}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={sectionTitle}>Reorder Grid</h2>
                    <p style={sectionNote}>Loads one category working set at a time for speed. Large categories are capped to the first {CATEGORY_WORK_SIZE} items in this pass.</p>
                  </div>
                  <select value={reorderCategory} onChange={(e) => setReorderCategory(e.target.value)} style={selectStyle}>
                    {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                  {reorderProducts.map((product) => (
                    <div key={product.id} draggable onDragStart={() => setDragId(product.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => void swapReorder(product.id)} style={reorderCard}>
                      <div style={thumbWrap}>{product.image ? <img src={product.image} alt={product.name} style={thumbImage} /> : <span style={mutedSmall}>No image</span>}</div>
                      <div style={{ fontWeight: 800 }}>{product.name}</div>
                      <div style={mutedSmall}>{product.code}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {activeSection === 'customers' ? (
              <section style={panelBlock}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={sectionTitle}>Customer Management</h2>
                    <p style={sectionNote}>Paged customer lists for scale. Only 50 customers load at a time now.</p>
                  </div>
                </div>
                <div style={{ ...toolbarGrid, gridTemplateColumns: 'auto auto auto 1fr' }}>
                  <button onClick={() => setCustomerTab('regular')} style={customerTab === 'regular' ? redButton : ghostButton}>Regular customers</button>
                  <button onClick={() => setCustomerTab('premium')} style={customerTab === 'premium' ? redButton : ghostButton}>Premium customers</button>
                  <button onClick={() => setCustomerTab('requests')} style={customerTab === 'requests' ? redButton : ghostButton}>Customer requests</button>
                  <label style={searchWrap}><Search size={16} /><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customers" style={inputBare} /></label>
                </div>

                <div style={listWrap}>
                  <div style={{ ...listHead, gridTemplateColumns: '1.3fr 1.2fr 1fr 120px 120px' }}>
                    <span>Name</span>
                    <span>Email</span>
                    <span>Phone</span>
                    <span>Orders</span>
                    <span>{customerTab === 'requests' ? 'Approve' : 'Tier'}</span>
                  </div>
                  {customerRows.map((person) => (
                    <div key={person.id} style={{ ...listRow, gridTemplateColumns: '1.3fr 1.2fr 1fr 120px 120px' }}>
                      <span style={{ fontWeight: 700 }}>{person.name || 'Unnamed'}</span>
                      <span>{person.email}</span>
                      <span>{person.phone || '-'}</span>
                      <span>{person.orderCount}</span>
                      {customerTab === 'requests' ? (
                        <button onClick={() => void approveRequest(person)} style={smallGhost}>Approve</button>
                      ) : (
                        <button onClick={() => void updateCustomer(person, { tier: person.tier === 'premium' ? 'regular' : 'premium' })} style={smallGhost}>{person.tier === 'premium' ? 'Premium' : 'Regular'}</button>
                      )}
                    </div>
                  ))}
                </div>
                <Pager page={customerPage} totalPages={customerPages} onChange={setCustomerPage} />
              </section>
            ) : null}

            {activeSection === 'pricing' ? (
              <section style={panelBlock}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={sectionTitle}>Pricing & Returns</h2>
                    <p style={sectionNote}>Category working set only. Select all or hand-pick from the loaded category slice.</p>
                  </div>
                </div>
                <div style={{ ...toolbarGrid, gridTemplateColumns: '1fr auto auto' }}>
                  <select value={pricingCategory} onChange={(e) => { setPricingCategory(e.target.value); setSelectedPricing([]); }} style={selectStyle}>
                    {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <button onClick={toggleSelectAllPricing} style={ghostButton}>{selectedPricing.length === pricingProducts.length ? 'Clear all' : 'Select all'}</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={priceDelta} onChange={(e) => setPriceDelta(e.target.value)} style={tinyInput} placeholder="-10" />
                    <button onClick={() => void applyPricing()} style={redButton}>Apply %</button>
                  </div>
                </div>
                <div style={checkboxList}>
                  {pricingProducts.map((product) => (
                    <label key={product.id} style={checkboxRow}>
                      <input type="checkbox" checked={selectedPricing.includes(product.id)} onChange={(e) => setSelectedPricing((prev) => e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id))} />
                      <span>{product.name}</span>
                      <small style={mutedSmall}>{product.code}</small>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {activeSection === 'orders' ? (
              <section style={panelBlock}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={sectionTitle}>Order Requests</h2>
                    <p style={sectionNote}>Only recent orders are loaded here for speed.</p>
                  </div>
                  <label style={searchWrap}><Search size={16} /><input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search orders" style={inputBare} /></label>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {orderRows.map((order) => (
                    <div key={order.id} style={orderCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{order.order_number || order.id.slice(0, 8)}</div>
                          <div style={mutedSmall}>{order.customers?.name || 'Unknown'} · {order.customers?.email || 'No email'}</div>
                        </div>
                        <select value={order.status || 'viewed'} onChange={(e) => void updateOrder(order, { status: e.target.value })} style={selectStyle}>
                          {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                        <div style={subtleBox}><strong>Order placed</strong><div style={mutedSmall}>{compactItems(order.original_items || order.items || [])}</div></div>
                        <div style={subtleBox}><strong>Order final</strong><div style={mutedSmall}>{compactItems(order.final_items || order.items || [])}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </div>

      {editorOpen ? (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 24, fontFamily: 'Outfit, sans-serif' }}>{editingProduct ? 'Edit product' : 'Add product'}</h3>
                <p style={{ margin: '6px 0 0', color: '#64748b' }}>Fill in the product details, then place it into a main category and subcategory.</p>
              </div>
              <button onClick={closeEditor} style={iconButton}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Product code"><input value={productForm.code} onChange={(e) => setProductForm((prev) => ({ ...prev, code: e.target.value }))} style={fieldInput} /></Field>
              <Field label="Product type">
                <select value={productForm.productType} onChange={(e) => setProductForm((prev) => ({ ...prev, productType: e.target.value }))} style={fieldInput}>
                  {productTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Product name" full><input value={productForm.name} onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))} style={fieldInput} /></Field>
              <Field label="Image URL" full><input value={productForm.image} onChange={(e) => setProductForm((prev) => ({ ...prev, image: e.target.value }))} style={fieldInput} /></Field>
              <Field label="Price"><input value={productForm.price} onChange={(e) => setProductForm((prev) => ({ ...prev, price: e.target.value }))} style={fieldInput} /></Field>
              <Field label="Stock on hand"><input value={productForm.stockOnHand} onChange={(e) => setProductForm((prev) => ({ ...prev, stockOnHand: e.target.value }))} style={fieldInput} /></Field>
              <Field label="Main category">
                <select value={productForm.categoryId} onChange={(e) => setProductForm((prev) => ({ ...prev, categoryId: e.target.value, subcategoryId: subcategoryOptions(e.target.value)[0]?.id || '' }))} style={fieldInput}>
                  {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Subcategory">
                <select value={productForm.subcategoryId} onChange={(e) => setProductForm((prev) => ({ ...prev, subcategoryId: e.target.value }))} style={fieldInput}>
                  {subcategoryOptions(productForm.categoryId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={closeEditor} style={ghostButton}><ChevronLeft size={16} /> Cancel</button>
              <button onClick={() => void saveProduct()} style={redButton}>{saving === 'new-product' || saving === editingProduct?.id ? 'Saving…' : <><Check size={16} /> Save product</>}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <label style={{ display: 'grid', gap: 8, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div style={statCard}>
      <div style={{ color: '#94a3b8', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>{value}</div>
    </div>
  );
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 18 }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} style={ghostButton} disabled={page <= 1}><ChevronLeft size={16} /> Prev</button>
      <span style={mutedSmall}>Page {page} of {totalPages}</span>
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} style={ghostButton} disabled={page >= totalPages}>Next <ChevronRight size={16} /></button>
    </div>
  );
}

const shell = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #020617 0%, #111827 35%, #f8fafc 35%, #f8fafc 100%)',
  color: '#0f172a',
  fontFamily: 'Inter, sans-serif',
};
const heroCard = { borderRadius: 28, background: 'linear-gradient(135deg, #111827 0%, #7f1d1d 100%)', color: '#fff', padding: 24, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 };
const statsGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 };
const statCard = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 18 };
const sidebarCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 22, padding: 14, position: 'sticky', top: 24 };
const sideButton = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: '#fff', color: '#0f172a', padding: '14px 16px', borderRadius: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left', marginBottom: 8 };
const sideButtonActive = { background: '#111827', color: '#fff' };
const panel = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 22, padding: 20, display: 'flex', alignItems: 'center', gap: 10 };
const panelBlock = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 22, boxShadow: '0 10px 30px rgba(15,23,42,0.05)' };
const sectionHeader = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 };
const sectionTitle = { margin: 0, fontSize: 28, fontFamily: 'Outfit, sans-serif' };
const sectionNote = { margin: '6px 0 0', color: '#64748b' };
const toolbarGrid = { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginBottom: 18 };
const searchWrap = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #cbd5e1', borderRadius: 14, padding: '0 14px', background: '#fff', minHeight: 46 };
const inputBare = { border: 'none', outline: 'none', width: '100%', fontSize: 14, background: 'transparent' };
const selectStyle = { minHeight: 46, borderRadius: 14, border: '1px solid #cbd5e1', padding: '0 12px', background: '#fff' };
const tinyInput = { ...selectStyle, width: 90 };
const fieldInput = { ...selectStyle, width: '100%' };
const listWrap = { border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden' };
const listHead = { display: 'grid', gridTemplateColumns: '1.5fr 1fr 180px 120px', gap: 12, padding: '14px 16px', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 700 };
const listRow = { display: 'grid', gridTemplateColumns: '1.5fr 1fr 180px 120px', gap: 12, padding: '16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' };
const reorderCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 14, cursor: 'grab' };
const thumbWrap = { aspectRatio: '1 / 1', borderRadius: 14, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10 };
const thumbImage = { width: '100%', height: '100%', objectFit: 'cover' };
const checkboxList = { display: 'grid', gap: 8, maxHeight: 460, overflow: 'auto', paddingRight: 4 };
const checkboxRow = { display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 10, alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 14px' };
const orderCard = { border: '1px solid #e2e8f0', borderRadius: 18, padding: 16 };
const subtleBox = { border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#f8fafc' };
const modalBackdrop = { position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 40 };
const modalCard = { width: 'min(900px, 100%)', background: '#fff', borderRadius: 24, padding: 24, boxShadow: '0 40px 80px rgba(2,6,23,0.35)' };
const redButton = { display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: '#b91c1c', color: '#fff', borderRadius: 14, padding: '11px 16px', fontWeight: 800, cursor: 'pointer' };
const darkButton = { display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: '#111827', color: '#fff', borderRadius: 14, padding: '11px 16px', fontWeight: 800, cursor: 'pointer' };
const ghostButton = { display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: 14, padding: '11px 16px', fontWeight: 700, cursor: 'pointer' };
const whiteGhost = { display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 14, padding: '11px 16px', fontWeight: 700, cursor: 'pointer' };
const iconButton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' };
const smallGhost = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, minHeight: 34, padding: '0 10px', cursor: 'pointer' };
const pill = { display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 12 };
const mutedSmall = { color: '#64748b', fontSize: 12 };
