import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, Download,
  Edit2, Loader2, LogOut, PackagePlus, Star, StarOff, Upload, Users, X,
} from 'lucide-react';
import {
  archiveProduct, bulkUpsertProducts, createProduct, exportProductsCsv,
  fetchAllProductsAdmin, setSpecial, updateProduct, updateSortOrder,
} from '../lib/products';
import { approveCustomer, bulkSetTiersFromCsv, fetchAllCustomers, setCustomerTier } from '../lib/customers';
import { fetchAllOrdersAdmin } from '../lib/orders';
import categories from '../data/categories.json';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function flatCategories(cats, depth = 0, result = []) {
  for (const c of cats) {
    result.push({ id: c.id, label: '  '.repeat(depth) + c.label });
    if (c.children) flatCategories(c.children, depth + 1, result);
  }
  return result;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

const ADMIN_STYLE = {
  fontFamily: 'Inter, sans-serif',
  minHeight: '100vh',
  background: '#0a0a0a',
  color: '#f1f5f9',
};

const CARD = {
  background: '#111827',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '24px',
};

const BTN = (variant = 'primary') => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '8px 16px', borderRadius: '8px', fontWeight: '600',
  fontSize: '13px', cursor: 'pointer',
  ...(variant === 'primary' && { background: '#e11d48', color: '#fff', border: 'none' }),
  ...(variant === 'ghost'   && { background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b' }),
  ...(variant === 'danger'  && { background: '#7f1d1d', color: '#fca5a5', border: 'none' }),
  ...(variant === 'success' && { background: '#14532d', color: '#86efac', border: 'none' }),
});

const INPUT_STYLE = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  background: '#0f172a', border: '1px solid #1e293b', color: '#f1f5f9',
  fontSize: '13px',
};

// ── Product Form Modal ────────────────────────────────────────────────────────

const EMPTY_PRODUCT = {
  code: '', name: '', price_ex_vat: '', image_url: '', stock_on_hand: '',
  category_path: [], is_new: false, is_archived: false,
  min_qty: 1, case_pack: '', lead_time: '', trade_note: '',
};

function ProductFormModal({ product, onSave, onClose }) {
  const [form, setForm] = useState(product
    ? {
        code: product.code, name: product.name, price_ex_vat: product.price,
        image_url: product.image, stock_on_hand: product.stockOnHand,
        category_path: product.categoryPath || [], is_new: product.isNew,
        is_archived: product.isArchived, min_qty: product.minQty,
        case_pack: product.casePack, lead_time: product.leadTime,
        trade_note: product.tradeNote,
      }
    : { ...EMPTY_PRODUCT });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const allCats = flatCategories(categories);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async () => {
    if (!form.code || !form.name || !form.price_ex_vat) {
      setError('Code, name and price are required.');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        price_ex_vat: Number(form.price_ex_vat),
        stock_on_hand: Number(form.stock_on_hand) || 0,
        min_qty: Number(form.min_qty) || 1,
      };
      if (product?.id) await updateProduct(product.id, payload);
      else await createProduct(payload);
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ ...CARD, width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700' }}>{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} style={{ ...BTN('ghost'), padding: '6px' }}><X size={16} /></button>
        </div>

        {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[
            ['Code *', 'code', 'text'],
            ['Price Ex VAT (R) *', 'price_ex_vat', 'number'],
            ['Stock on Hand', 'stock_on_hand', 'number'],
            ['Min Qty', 'min_qty', 'number'],
          ].map(([label, key, type]) => (
            <div key={key}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{label}</label>
              <input type={type} value={form[key]} onChange={set(key)} style={INPUT_STYLE} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Product Name *</label>
          <input value={form.name} onChange={set('name')} style={INPUT_STYLE} />
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Image URL</label>
          <input value={form.image_url} onChange={set('image_url')} style={INPUT_STYLE} placeholder="https://..." />
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Category</label>
          <select
            value={form.category_path?.[0] || ''}
            onChange={(e) => setForm((f) => ({ ...f, category_path: e.target.value ? [e.target.value] : [] }))}
            style={INPUT_STYLE}
          >
            <option value="">— None —</option>
            {allCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        {[['Case Pack', 'case_pack'], ['Lead Time', 'lead_time'], ['Trade Note', 'trade_note']].map(([label, key]) => (
          <div key={key} style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{label}</label>
            <input value={form[key]} onChange={set(key)} style={INPUT_STYLE} />
          </div>
        ))}

        <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
          {[['New Stock', 'is_new'], ['Archived', 'is_archived']].map(([label, key]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form[key]} onChange={set(key)} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={BTN('ghost')}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={BTN('primary')}>
            {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Save Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileRef = useRef();
  const customerFileRef = useRef();
  const allCats = flatCategories(categories);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await fetchAllProductsAdmin()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    if (filterStatus === 'active' && p.isArchived) return false;
    if (filterStatus === 'archived' && !p.isArchived) return false;
    if (filterCat && !p.categoryPath.includes(filterCat)) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleArchive = async (p) => {
    await archiveProduct(p.id, !p.isArchived);
    load();
  };

  const handleStar = async (p) => {
    await setSpecial(p.id, !p.isSpecial, p.specialVisibility || 'all');
    load();
  };

  const handleVisibility = async (p, vis) => {
    await setSpecial(p.id, p.isSpecial, vis);
    load();
  };

  const moveOrder = async (p, direction) => {
    const sorted = [...products].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((x) => x.id === p.id);
    const target = sorted[idx + direction];
    if (!target) return;
    await updateSortOrder(p.id, target.sortOrder);
    await updateSortOrder(target.id, p.sortOrder);
    load();
  };

  const handleImportCsv = async (file) => {
    if (!file) return;
    setImporting(true); setImportError(''); setImportSuccess('');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      // Expected columns: code, price_ex_vat, image_url, stock_on_hand
      const mapped = rows.map((r) => ({
        code: r.code || r['code'],
        name: r.name || r['name'] || r.code,
        price_ex_vat: Number(r['price_ex_vat'] || r['price'] || 0),
        image_url: r['image_url'] || r['image'] || '',
        stock_on_hand: Number(r['stock_on_hand'] || r['stock'] || 0),
        category_path: r['category'] ? [r['category']] : [],
        is_archived: false,
      })).filter((r) => r.code && r.price_ex_vat > 0);
      const result = await bulkUpsertProducts(mapped);
      setImportSuccess(`Imported ${result.length} product${result.length !== 1 ? 's' : ''}.`);
      load();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    const rows = await exportProductsCsv();
    downloadCsv(rows.map((r) => ({
      code: r.code, name: r.name, price_ex_vat: r.price_ex_vat,
      image_url: r.image_url, stock_on_hand: r.stock_on_hand,
      category: (r.category_path || []).join(' > '),
      is_archived: r.is_archived, is_special: r.is_special,
      special_visibility: r.special_visibility,
    })), 'proto-products.csv');
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input
          placeholder="Search code or name…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...INPUT_STYLE, width: '220px' }}
        />
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...INPUT_STYLE, width: '200px' }}>
          <option value="">All Categories</option>
          {allCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...INPUT_STYLE, width: '140px' }}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={() => { setEditProduct(null); setShowForm(true); }} style={BTN('primary')}>
            <PackagePlus size={14} /> Add Product
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing} style={BTN('ghost')}>
            <Upload size={14} /> {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={(e) => { handleImportCsv(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={handleExport} style={BTN('ghost')}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {importError && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{importError}</div>}
      {importSuccess && <div style={{ background: '#14532d', color: '#86efac', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{importSuccess}</div>}

      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
        Showing {filtered.length} of {products.length} products
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}><Loader2 size={24} /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Pos', 'Image', 'Code', 'Name', 'Price Ex VAT', 'Stock', 'Category', 'Status', 'Special', 'Visibility', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '8px', color: '#475569' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button onClick={() => moveOrder(p, -1)} style={{ ...BTN('ghost'), padding: '2px 6px' }}><ChevronUp size={12} /></button>
                      <button onClick={() => moveOrder(p, 1)} style={{ ...BTN('ghost'), padding: '2px 6px' }}><ChevronDown size={12} /></button>
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {p.image ? <img src={p.image} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', background: '#1e293b' }} /> : <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#1e293b' }} />}
                  </td>
                  <td style={{ padding: '8px', fontFamily: 'monospace', color: '#94a3b8' }}>{p.code}</td>
                  <td style={{ padding: '8px', maxWidth: '220px' }}>{p.name}</td>
                  <td style={{ padding: '8px' }}>R{Number(p.price).toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>{p.stockOnHand}</td>
                  <td style={{ padding: '8px', color: '#64748b', fontSize: '11px' }}>{(p.categoryPath || []).join(' > ')}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', background: p.isArchived ? '#292524' : '#14532d', color: p.isArchived ? '#78716c' : '#86efac' }}>
                      {p.isArchived ? 'Archived' : 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button onClick={() => handleStar(p)} style={{ ...BTN('ghost'), padding: '4px 8px', color: p.isSpecial ? '#fbbf24' : '#475569' }}>
                      {p.isSpecial ? <Star size={14} fill="#fbbf24" /> : <StarOff size={14} />}
                    </button>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {p.isSpecial ? (
                      <select value={p.specialVisibility || 'all'} onChange={(e) => handleVisibility(p, e.target.value)} style={{ ...INPUT_STYLE, width: '100px', padding: '4px 8px' }}>
                        <option value="all">Both</option>
                        <option value="premium">Premium</option>
                        <option value="regular">Regular</option>
                      </select>
                    ) : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => { setEditProduct(p); setShowForm(true); }} style={{ ...BTN('ghost'), padding: '4px 8px' }}><Edit2 size={12} /></button>
                      <button onClick={() => handleArchive(p)} style={{ ...BTN('ghost'), padding: '4px 8px' }} title={p.isArchived ? 'Restore' : 'Archive'}>
                        {p.isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#334155' }}>No products found.</div>}
        </div>
      )}

      {showForm && (
        <ProductFormModal
          product={editProduct}
          onSave={() => { setShowForm(false); load(); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Customers Tab ─────────────────────────────────────────────────────────────

function CustomersTab() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState('all');
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomers(await fetchAllCustomers()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter((c) => {
    if (filterTier !== 'all' && c.tier !== filterTier) return false;
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleTier = async (id, tier) => {
    await setCustomerTier(id, tier);
    load();
  };

  const handleApprove = async (id, approved) => {
    await approveCustomer(id, approved);
    load();
  };

  const handleCsvImport = async (file) => {
    if (!file) return;
    setImporting(true); setImportMsg('');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      await bulkSetTiersFromCsv(rows);
      setImportMsg(`Processed ${rows.length} rows.`);
      load();
    } catch (err) {
      setImportMsg(`Error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    downloadCsv(customers.map((c) => ({
      email: c.email, name: c.name, phone: c.phone,
      tier: c.tier, is_approved: c.is_approved,
      created_at: c.created_at,
    })), 'proto-customers.csv');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...INPUT_STYLE, width: '220px' }} />
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} style={{ ...INPUT_STYLE, width: '140px' }}>
          <option value="all">All Tiers</option>
          <option value="regular">Regular</option>
          <option value="premium">Premium</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={() => fileRef.current?.click()} disabled={importing} style={BTN('ghost')}>
            <Upload size={14} /> Import CSV Tiers
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={(e) => { handleCsvImport(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={handleExport} style={BTN('ghost')}><Download size={14} /> Export</button>
        </div>
      </div>

      {importMsg && <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{importMsg}</div>}

      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
        <span style={{ marginRight: '16px' }}>{customers.filter((c) => !c.is_approved).length} pending approval</span>
        <span style={{ marginRight: '16px' }}>{customers.filter((c) => c.tier === 'premium').length} premium</span>
        <span>{customers.filter((c) => c.tier === 'regular').length} regular</span>
      </div>

      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px', padding: '8px 12px', background: '#0f172a', borderRadius: '8px' }}>
        CSV format for tier import: <code style={{ color: '#94a3b8' }}>email,tier</code> — tier values: <code style={{ color: '#94a3b8' }}>regular</code> or <code style={{ color: '#94a3b8' }}>premium</code>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}><Loader2 size={24} /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Name', 'Email', 'Phone', 'Delivery Address', 'Tier', 'Approved', 'Registered', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '10px 8px', fontWeight: '600' }}>{c.name || '—'}</td>
                  <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{c.email}</td>
                  <td style={{ padding: '10px 8px', color: '#64748b' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '10px 8px', color: '#64748b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.delivery_address || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <select value={c.tier} onChange={(e) => handleTier(c.id, e.target.value)}
                      style={{ ...INPUT_STYLE, width: '110px', padding: '4px 8px',
                        color: c.tier === 'premium' ? '#fbbf24' : '#94a3b8',
                        borderColor: c.tier === 'premium' ? '#92400e' : '#1e293b' }}>
                      <option value="regular">Regular</option>
                      <option value="premium">Premium</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <button
                      onClick={() => handleApprove(c.id, !c.is_approved)}
                      style={{ ...BTN(c.is_approved ? 'success' : 'danger'), padding: '4px 12px', fontSize: '11px' }}>
                      {c.is_approved ? 'Approved' : 'Approve'}
                    </button>
                  </td>
                  <td style={{ padding: '10px 8px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {new Date(c.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ fontSize: '11px', color: '#475569' }}>{c.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#334155' }}>No customers found.</div>}
        </div>
      )}
    </div>
  );
}

// ── Specials Tab ──────────────────────────────────────────────────────────────

function SpecialsTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await fetchAllProductsAdmin()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const specials = products.filter((p) => p.isSpecial && !p.isArchived);
  const nonSpecials = products.filter((p) => !p.isSpecial && !p.isArchived);

  const toggleStar = async (p) => {
    await setSpecial(p.id, !p.isSpecial, p.specialVisibility || 'all');
    load();
  };

  const setVis = async (p, vis) => {
    await setSpecial(p.id, true, vis);
    load();
  };

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: '#fbbf24' }}>
        ★ This Week&apos;s Specials ({specials.length})
      </h3>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}><Loader2 size={24} /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '32px' }}>
            {specials.length === 0 && (
              <div style={{ color: '#334155', gridColumn: '1/-1', padding: '20px' }}>
                No specials set. Star products below to add them.
              </div>
            )}
            {specials.map((p) => (
              <div key={p.id} style={{ background: '#1e2d3d', border: '1px solid #fbbf24', borderRadius: '10px', padding: '12px', position: 'relative' }}>
                {p.image && <img src={p.image} alt="" style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px' }} />}
                <div style={{ fontSize: '12px', fontWeight: '700' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{p.code} · R{p.price.toFixed(2)}</div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
                  <select value={p.specialVisibility || 'all'} onChange={(e) => setVis(p, e.target.value)}
                    style={{ ...INPUT_STYLE, flex: 1, padding: '4px 6px', fontSize: '11px' }}>
                    <option value="all">Both tiers</option>
                    <option value="premium">Premium only</option>
                    <option value="regular">Regular only</option>
                  </select>
                  <button onClick={() => toggleStar(p)} style={{ ...BTN('ghost'), padding: '4px 6px', color: '#fbbf24' }}><StarOff size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', color: '#64748b' }}>
            Add to Specials
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
            {nonSpecials.slice(0, 60).map((p) => (
              <button key={p.id} onClick={() => toggleStar(p)}
                style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {p.image && <img src={p.image} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />}
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: '#475569' }}>{p.code}</div>
                </div>
                <Star size={13} style={{ marginLeft: 'auto', flexShrink: 0, color: '#334155' }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setOrders(await fetchAllOrdersAdmin()); } catch {}
      setLoading(false);
    })();
  }, []);

  const handleExport = () => {
    downloadCsv(orders.map((o) => ({
      id: o.id,
      customer_name: o.customers?.name || '',
      customer_email: o.customers?.email || '',
      customer_tier: o.customers?.tier || '',
      total_ex_vat: o.total_ex_vat,
      status: o.status,
      item_count: (o.items || []).length,
      created_at: o.created_at,
    })), 'proto-orders.csv');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button onClick={handleExport} style={BTN('ghost')}><Download size={14} /> Export CSV</button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}><Loader2 size={24} /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Customer', 'Email', 'Tier', 'Items', 'Total Ex VAT', 'Status', 'Date'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontSize: '10px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '10px 8px' }}>{o.customers?.name || 'Unknown'}</td>
                  <td style={{ padding: '10px 8px', color: '#64748b' }}>{o.customers?.email || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
                      background: o.customers?.tier === 'premium' ? '#78350f' : '#1e293b',
                      color: o.customers?.tier === 'premium' ? '#fbbf24' : '#94a3b8' }}>
                      {o.customers?.tier || 'regular'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{(o.items || []).length}</td>
                  <td style={{ padding: '10px 8px', fontWeight: '700' }}>R{Number(o.total_ex_vat).toFixed(2)}</td>
                  <td style={{ padding: '10px 8px', color: '#64748b' }}>{o.status}</td>
                  <td style={{ padding: '10px 8px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {new Date(o.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#334155' }}>No orders yet.</div>}
        </div>
      )}
    </div>
  );
}

// ── Admin Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'products',   label: 'Products',  icon: PackagePlus },
  { id: 'customers',  label: 'Customers', icon: Users },
  { id: 'specials',   label: 'Specials',  icon: Star },
  { id: 'orders',     label: 'Orders',    icon: Download },
];

export default function AdminPage({ customer, onLogout, onViewPortal }) {
  const [activeTab, setActiveTab] = useState('products');

  return (
    <div style={ADMIN_STYLE}>
      {/* Header */}
      <header style={{ background: '#111827', borderBottom: '1px solid #1e293b', padding: '0 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontWeight: '900', fontSize: '18px', fontFamily: 'Outfit, sans-serif' }}>
              <span style={{ color: '#fff' }}>PROTO </span>
              <span style={{ color: '#e11d48' }}>ADMIN</span>
            </div>
            <span style={{ background: '#7f1d1d', color: '#fca5a5', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700' }}>Admin Panel</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>{customer?.email}</span>
            <button onClick={onViewPortal} style={BTN('ghost')}>
              ← View Catalogue
            </button>
            <button onClick={onLogout} style={BTN('ghost')}><LogOut size={14} /> Logout</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1e293b', padding: '0 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '0' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '14px 20px', background: 'transparent', border: 'none',
                  borderBottom: active ? '2px solid #e11d48' : '2px solid transparent',
                  color: active ? '#fff' : '#64748b', fontWeight: active ? '700' : '500',
                  fontSize: '14px', cursor: 'pointer',
                }}>
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        <div style={CARD}>
          {activeTab === 'products'  && <ProductsTab />}
          {activeTab === 'customers' && <CustomersTab />}
          {activeTab === 'specials'  && <SpecialsTab />}
          {activeTab === 'orders'    && <OrdersTab />}
        </div>
      </div>
    </div>
  );
}
