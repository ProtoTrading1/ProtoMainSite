import { useState } from 'react';
import './DeviceBasketCopy.css';

export default function DeviceBasketCopy({ copy, currentItems, onDiscard }) {
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!copy) return null;
  return (
    <section className="device-basket-copy" aria-label="Saved device basket copy">
      <strong>Your device basket was kept separately</strong>
      <p>Your current basket is shown below. Your earlier device copy has {copy.items.length} product lines. Review it before deciding what to keep.</p>
      <button type="button" onClick={() => setReviewing(!reviewing)} aria-expanded={reviewing}>
        {reviewing ? 'Close device copy' : 'Review device copy'}
      </button>
      {reviewing && <>
        <p>Nothing is added or replaced automatically. Use the normal search and quantity controls to add any missing lines you choose.</p>
        <table>
          <caption>Saved device quantities compared with your current basket</caption>
          <thead><tr><th scope="col">Product / preference</th><th scope="col">Device</th><th scope="col">Current</th></tr></thead>
          <tbody>{copy.items.map((item, index) => {
            const id = String(item.product.id || item.product.sku || item.product.code);
            const match = currentItems.find((current) => String(current.product.id || current.product.sku || current.product.code) === id
              && String(current.preference || '') === String(item.preference || ''));
            return <tr key={`${id}-${index}`}><th scope="row">{item.product.code || id}<span>{item.product.name}</span>{item.preference && <span>{item.preference}</span>}</th><td>{item.qty}</td><td>{match?.qty || 0}</td></tr>;
          })}</tbody>
        </table>
        {confirmDiscard ? <div>
          <p>Discard only this saved device copy? Your current basket stays as it is.</p>
          <button type="button" onClick={onDiscard}>Discard saved device copy</button>
          <button type="button" onClick={() => setConfirmDiscard(false)}>Cancel</button>
        </div> : <button type="button" onClick={() => setConfirmDiscard(true)}>Discard device copy</button>}
      </>}
    </section>
  );
}
