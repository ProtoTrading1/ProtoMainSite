import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileSpreadsheet,
  ImageOff,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { fetchProducts } from '../lib/products';
import { catalogCardImageUrl } from '../lib/imageUrl';
import {
  MAX_QUICK_ORDER_LINES,
  parseQuickOrderText,
  resolveQuickOrderLines,
  updateQuickOrderLineQty,
} from '../lib/quickOrder';
import './QuickOrder.css';

const STARTING_ROWS = [{ id: 'manual-1', code: '', qty: 1 }];

function money(value) {
  return `R${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function QuickOrderImage({ line }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && line.image ? catalogCardImageUrl(line.image) : '';
  if (!src) {
    return (
      <div className="qo-product-image qo-product-image--empty" aria-label="Product image coming soon">
        <ImageOff size={19} aria-hidden="true" />
        <span>Image coming soon</span>
      </div>
    );
  }
  return (
    <div className="qo-product-image">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

function availabilityCopy(line) {
  if (line.status === 'not_found') return { label: 'Item code not found', guidance: '' };
  if (line.status === 'below_minimum') {
    return {
      label: line.availability?.label || 'Available',
      guidance: `Minimum quantity is ${line.minimum}`,
    };
  }
  const label = line.availability?.label || (line.status === 'unavailable' ? 'Currently unavailable' : 'Available now');
  const guidance = line.availability?.guidance && line.availability.guidance !== label
    ? line.availability.guidance
    : '';
  return { label, guidance };
}

export default function QuickOrder({ onAddItems, onSearchProduct, onClose, cartReady = true }) {
  const [mode, setMode] = useState('paste');
  const [draft, setDraft] = useState('');
  const [manualRows, setManualRows] = useState(STARTING_ROWS);
  const [lines, setLines] = useState([]);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const fileRef = useRef(null);

  const validLines = useMemo(() => lines.filter((line) => line.valid), [lines]);
  const attentionLines = lines.length - validLines.length;
  const unitCount = validLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = validLines.reduce((sum, line) => sum + line.lineTotal, 0);

  const matchText = async (text) => {
    const parsed = parseQuickOrderText(text);
    if (!parsed.length) {
      setMessage('Add at least one item code and quantity first.');
      setLines([]);
      setState('idle');
      return;
    }
    setState('loading');
    setMessage('');
    try {
      const products = await fetchProducts();
      const resolved = resolveQuickOrderLines(parsed, products);
      setLines(resolved);
      setLastCheckedAt(new Date());
      setState('ready');
    } catch {
      setState('error');
      setMessage('Quick Order could not reach the live catalogue. Your list is still here—please try again.');
    }
  };

  const handleMatch = () => {
    if (mode === 'manual') {
      const text = manualRows
        .filter((row) => row.code.trim())
        .map((row) => `${row.code.trim()},${row.qty || 1}`)
        .join('\n');
      void matchText(text);
      return;
    }
    void matchText(draft);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setMessage('Please upload a CSV or text file.');
      return;
    }
    const text = await file.text();
    setDraft(text);
    setMode('paste');
    void matchText(text);
  };

  const removeLine = (id) => setLines((current) => current.filter((line) => line.id !== id));
  const changeQty = (id, nextQty) => setLines((current) => updateQuickOrderLineQty(current, id, nextQty));

  const addToBasket = () => {
    if (!validLines.length) return;
    const result = onAddItems?.(validLines.map((line) => ({ product: line.product, qty: line.qty }))) || {};
    if (result.added > 0) {
      const skipped = Number(result.overflow) || 0;
      setMessage(skipped
        ? `${result.added} item lines added to your basket. ${skipped} exceeded the basket line limit.`
        : `${result.added} item line${result.added === 1 ? '' : 's'} added to your basket.`);
      setState('added');
    } else {
      setMessage(result.reason || 'Your basket is still loading. Please try again in a moment.');
    }
  };

  const downloadTemplate = () => {
    const rows = [
      ['Item code', 'Quantity'],
      ['TLUG1-TAN', '4'],
      ['BAG102', '12'],
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'proto-quick-order-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="quick-order" aria-labelledby="quick-order-title">
      <div className="qo-heading-row">
        <div>
          <div className="qo-eyebrow"><ClipboardList size={16} /> Wholesale ordering</div>
          <h1 id="quick-order-title">Quick Order</h1>
          <p>Build a wholesale order in minutes using item codes from an old invoice or stock list.</p>
        </div>
        <button type="button" className="qo-close" onClick={onClose} aria-label="Close Quick Order">
          <X size={20} />
        </button>
      </div>

      <div className="qo-mode-tabs" role="tablist" aria-label="Quick Order entry method">
        <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>
          <ClipboardList size={17} /> Paste list
        </button>
        <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
          <Upload size={17} /> Upload CSV
        </button>
        <button type="button" role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>
          <Pencil size={17} /> Enter one by one
        </button>
      </div>

      <div className="qo-entry-section">
        {mode === 'paste' && (
          <div className="qo-entry-main">
            <label htmlFor="qo-paste">Paste item codes and quantities from Excel or an old invoice—one item per row.</label>
            <textarea
              id="qo-paste"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={'TLUG1-TAN    4\nBAG102       12\nCANVAS50     6'}
              rows={5}
              autoFocus
            />
            <span className="qo-entry-help">Use a comma, tab or space between the item code and quantity. Maximum {MAX_QUICK_ORDER_LINES} lines.</span>
          </div>
        )}

        {mode === 'upload' && (
          <div className="qo-upload-panel">
            <FileSpreadsheet size={30} aria-hidden="true" />
            <strong>Upload your CSV order list</strong>
            <span>Use two columns: Item code and Quantity.</span>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
            <button type="button" className="qo-secondary-button" onClick={() => fileRef.current?.click()}><Upload size={16} /> Choose CSV</button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="qo-manual-panel">
            <div className="qo-manual-labels"><span>Item code or barcode</span><span>Quantity</span></div>
            {manualRows.map((row, index) => (
              <div className="qo-manual-row" key={row.id}>
                <input aria-label={`Item code ${index + 1}`} value={row.code} onChange={(event) => setManualRows((current) => current.map((item) => item.id === row.id ? { ...item, code: event.target.value } : item))} placeholder="e.g. TLUG1-TAN" />
                <input aria-label={`Quantity ${index + 1}`} type="number" min="1" max="9999" value={row.qty} onChange={(event) => setManualRows((current) => current.map((item) => item.id === row.id ? { ...item, qty: event.target.value } : item))} />
                <button type="button" aria-label={`Remove line ${index + 1}`} disabled={manualRows.length === 1} onClick={() => setManualRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 size={17} /></button>
              </div>
            ))}
            <button type="button" className="qo-add-line" onClick={() => setManualRows((current) => [...current, { id: `manual-${Date.now()}`, code: '', qty: 1 }])}><Plus size={16} /> Add another line</button>
          </div>
        )}

        <div className="qo-entry-actions">
          <button type="button" className="qo-template-link" onClick={downloadTemplate}><FileDown size={16} /> Download CSV template</button>
          <button type="button" className="qo-primary-button" onClick={handleMatch} disabled={state === 'loading'}>
            {state === 'loading' ? <><Loader2 size={17} className="qo-spin" /> Matching products…</> : <><Search size={17} /> Match products</>}
          </button>
          <button type="button" className="qo-clear-button" onClick={() => { setDraft(''); setLines([]); setMessage(''); setState('idle'); }}><Trash2 size={16} /> Clear</button>
        </div>
      </div>

      {message && (
        <div className={`qo-message${state === 'added' ? ' qo-message--success' : state === 'error' ? ' qo-message--error' : ''}`} role={state === 'error' ? 'alert' : 'status'}>
          {state === 'added' ? <CheckCircle2 size={17} /> : state === 'error' ? <AlertTriangle size={17} /> : null}
          <span>{message}</span>
        </div>
      )}

      {lines.length > 0 && (
        <div className="qo-results" aria-live="polite">
          <div className="qo-results-summary">
            <span>{lines.length} line{lines.length === 1 ? '' : 's'} checked</span>
            <span className="qo-summary-good">{validLines.length} matched</span>
            {attentionLines > 0 && <span className="qo-summary-warning">{attentionLines} need{attentionLines === 1 ? 's' : ''} attention</span>}
          </div>

          <div className="qo-table-wrap">
            <table className="qo-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Item code</th>
                  <th>Product</th>
                  <th>MOQ</th>
                  <th>Available</th>
                  <th>Qty</th>
                  <th>Unit price incl. VAT</th>
                  <th>Total</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const availability = availabilityCopy(line);
                  return (
                    <tr key={line.id} className={line.valid ? '' : 'qo-row--attention'}>
                      <td data-label="Status">
                        <span className={`qo-status qo-status--${line.status}`}>
                          {line.valid ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                          {line.valid ? 'Matched' : 'Needs attention'}
                        </span>
                      </td>
                      <td data-label="Item code"><strong>{line.code}</strong></td>
                      <td data-label="Product">
                        {line.product ? (
                          <div className="qo-product-cell">
                            <QuickOrderImage line={line} />
                            <div>
                              <strong>{line.product.name || line.product.title}</strong>
                              {!line.image && <span className="qo-code-only-note">Code-only item · Image does not block ordering</span>}
                            </div>
                          </div>
                        ) : <span className="qo-problem-copy">Item not found</span>}
                      </td>
                      <td data-label="MOQ">{line.product ? line.minimum : '—'}</td>
                      <td data-label="Available">
                        <span className={`qo-availability${line.valid ? '' : ' qo-availability--warning'}`}>
                          <strong>{availability.label}</strong>
                          {availability.guidance && <small>{availability.guidance}</small>}
                        </span>
                      </td>
                      <td data-label="Qty">
                        <div className="qo-qty-control">
                          <button type="button" aria-label={`Decrease ${line.code} quantity`} onClick={() => changeQty(line.id, line.qty - 1)} disabled={line.qty <= 1}><Minus size={15} /></button>
                          <input aria-label={`${line.code} quantity`} type="number" min="1" max="9999" value={line.qty} onChange={(event) => changeQty(line.id, event.target.value)} />
                          <button type="button" aria-label={`Increase ${line.code} quantity`} onClick={() => changeQty(line.id, line.qty + 1)}><Plus size={15} /></button>
                        </div>
                      </td>
                      <td data-label="Unit price incl. VAT">{line.product ? money(line.price) : '—'}</td>
                      <td data-label="Total"><strong>{line.product ? money(line.lineTotal) : '—'}</strong></td>
                      <td className="qo-row-actions">
                        {!line.product && <button type="button" onClick={() => onSearchProduct?.(line.code)}><Search size={15} /><span>Search</span></button>}
                        <button type="button" aria-label={`Remove ${line.code}`} onClick={() => removeLine(line.id)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="qo-basket-bar">
          <div className="qo-basket-counts">
            <strong>{validLines.length} valid item{validLines.length === 1 ? '' : 's'} <span>·</span> {unitCount} units</strong>
            <small><Check size={14} /> Prices and availability checked {lastCheckedAt ? 'moments ago' : 'now'}</small>
          </div>
          <div className="qo-basket-total">
            <span>Subtotal incl. VAT</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <button type="button" className="qo-add-basket" onClick={addToBasket} disabled={!validLines.length || !cartReady}>
            <ShoppingCart size={18} /> Add {validLines.length} item{validLines.length === 1 ? '' : 's'} to basket
          </button>
        </div>
      )}
    </section>
  );
}
