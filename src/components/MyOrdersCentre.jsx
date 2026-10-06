import { ChevronDown, ChevronUp, Package, RotateCcw, Truck } from 'lucide-react';
import { useState } from 'react';
import { exactReceiptOrder } from '../lib/orderReceiptTarget.mjs';
import { customerOrderStatus, customerOrderTimeline, orderVatSummary } from '../lib/orderPresentation';

const buttonStyle = { minHeight: 44, padding: '9px 14px', border: '1px solid #8B1A1A', borderRadius: 9, background: '#fff', color: '#8B1A1A', fontWeight: 800, cursor: 'pointer' };

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MyOrdersCentre({ orders = [], onReorderOrder, loading = false, error = null, onRetry, receiptTarget = null }) {
  const [openOrderId, setOpenOrderId] = useState(undefined);
  const receiptOrder = exactReceiptOrder(orders, receiptTarget);
  return (
    <section aria-labelledby="my-orders-title" aria-busy={loading} style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 20, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 id="my-orders-title" style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#0f172a', display: 'flex', gap: 8, alignItems: 'center' }}><Package size={20} color="#8B1A1A" /> My orders</h2>
        <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 13 }}>Track requests, view order details and review previous products before reordering.</p>
      </div>
      {receiptTarget?.kind === 'unconfirmed' && <p role="status" style={{ color: '#475569', lineHeight: 1.5 }}>Your saved request is still unconfirmed. Previous orders below do not confirm that it was received. Return to your basket and use Check saved request, or contact Proto. Your basket is kept.</p>}
      {receiptTarget?.kind === 'received' && !loading && !error && !receiptOrder && <p role="status" style={{ color: '#475569', lineHeight: 1.5 }}>The confirmed receipt {receiptTarget.orderNumber} is not available in these recent orders. No other order has been selected in its place. Contact Proto with this receipt number if you need its details.</p>}
      {loading ? <p role="status" style={{ color: '#475569', fontSize: 14, margin: 0 }}>Loading your orders.</p> : error ? (
        <div role="alert">
          <p style={{ color: '#475569', fontSize: 14, margin: '0 0 12px' }}>{error}</p>
          {onRetry && <button type="button" onClick={onRetry} style={buttonStyle}>Retry order history</button>}
        </div>
      ) : orders.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>No orders placed yet.</p> : (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 12, overflow: 'hidden' }}>
          {orders.map((order, index) => {
            const open = openOrderId === undefined ? order === receiptOrder : order.id === openOrderId;
            const totals = orderVatSummary(order);
            const timeline = customerOrderTimeline(order.status);
            return <article key={order.id} aria-label={order === receiptOrder ? `Confirmed order ${order.order_number}` : undefined} style={{ borderTop: index ? '1px solid #e8eaed' : 'none' }}>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(130px,1fr) minmax(130px,1fr) auto', gap: 14, alignItems: 'center' }}>
                <div><strong style={{ color: '#0f172a' }}>{order.order_number || String(order.id).slice(0, 8)}</strong><div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{formatDate(order.created_at)}</div></div>
                <div style={{ fontSize: 12, color: '#475569' }}>{order.customer_notes ? <><strong>Your reference:</strong> {order.customer_notes}</> : 'No reference supplied'}</div>
                <div><strong style={{ color: '#8B1A1A' }}>R{totals.totalInclVat.toFixed(2)}</strong><div style={{ fontSize: 11, color: '#64748b' }}>estimated total incl. VAT</div></div>
                <button type="button" onClick={() => setOpenOrderId(open ? null : order.id)} aria-expanded={open} style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{open ? <>Hide <ChevronUp size={16} /></> : <>View order <ChevronDown size={16} /></>}</button>
              </div>
              <div style={{ padding: '0 16px 14px', fontSize: 13, color: '#475569' }}><strong>Status:</strong> <span style={{ color: '#8B1A1A', fontWeight: 800 }}>{customerOrderStatus(order.status)}</span></div>
              {open && <div style={{ borderTop: '1px solid #e8eaed', padding: 16, background: '#fafafa' }}>
                <div aria-label={`Order progress: ${customerOrderStatus(order.status)}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(100px, 1fr))', gap: 8, marginBottom: 18 }}>
                  {timeline.map((stage) => <div key={stage.key} style={{ fontSize: 12, color: stage.state === 'upcoming' ? '#94a3b8' : '#0f172a', fontWeight: stage.state === 'current' ? 800 : 600 }}><span aria-hidden="true" style={{ display: 'block', width: 10, height: 10, borderRadius: '50%', marginBottom: 6, background: stage.state === 'current' ? '#8B1A1A' : stage.state === 'complete' ? '#b58a26' : '#cbd5e1' }} />{stage.label}{stage.state === 'current' && <span className="sr-only"> — current stage</span>}</div>)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 13, marginBottom: 14 }}><Truck size={15} /><strong>Delivery:</strong> {order.delivery_method || 'To be confirmed'}</div>
                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th style={{ padding: '8px 0' }}>Product</th><th>SKU</th><th>Ordered</th><th style={{ textAlign: 'right' }}>Price at time of order</th></tr></thead><tbody>{(order.items || []).map((item, itemIndex) => <tr key={`${item.code || item.productId}-${itemIndex}`} style={{ borderTop: '1px solid #e8eaed' }}><td style={{ padding: '10px 0', fontWeight: 700 }}>{item.name || item.code}</td><td>{item.code || '—'}</td><td>{item.qty}</td><td style={{ textAlign: 'right' }}>R{Number(item.unitPrice || 0).toFixed(2)} incl. VAT</td></tr>)}</tbody></table></div>
                <p style={{ color: '#64748b', fontSize: 12, margin: '14px 0 0' }}>Final stock, current pricing and minimum quantities are checked before products are added to your basket. Your official pro-forma is sent separately after confirmation.</p>
                {onReorderOrder && Array.isArray(order.items) && order.items.length > 0 && <button type="button" onClick={() => onReorderOrder(order)} style={{ ...buttonStyle, marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7 }}><RotateCcw size={16} /> Review & reorder available items</button>}
              </div>}
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
