import { useLayoutEffect, useRef, useState } from 'react';
import { fixtureSkus, panelAvailable, runFixtureValidation, sessionIssue } from '../lib/archiveCheckoutPanel.mjs';
import './ArchiveCheckoutPanel.css';

export default function ArchiveCheckoutPanel({ session }) {
  const context = import.meta.env.ARCHIVE_CHECKOUT_PANEL_CONTEXT;
  const options = { context, publicScope: import.meta.env.VITE_ARCHIVE_TEST_CHECKOUT_SCOPE, authUrl: import.meta.env.VITE_SUPABASE_URL, hostname: window.location.hostname };
  const available = panelAvailable(context, options.publicScope, options.authUrl, options.hostname);
  const [sku, setSku] = useState(fixtureSkus[0]);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const active = useRef(null);
  const currentSession = useRef(session);
  // Invalidate before paint so a committed account/token change cannot expose an old receipt.
  useLayoutEffect(() => {
    currentSession.current = session;
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setResult(null);
    return () => active.current?.abort();
  }, [session]);
  if (!available) return null;
  const issue = sessionIssue(session);
  const changeSelection = (update) => { active.current?.abort(); active.current = null; setBusy(false); setResult(null); update(); };
  const run = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setResult(null);
    const receipt = await runFixtureValidation({ ...options, sku, qty, getSession: () => currentSession.current, signal: controller.signal });
    if (active.current !== controller || controller.signal.aborted) return;
    active.current = null;
    setBusy(false);
    setResult(receipt);
  };
  return <section className="archive-validation" aria-labelledby="archive-validation-title">
    <h2 id="archive-validation-title">Preview fixture validation</h2>
    <p>Checks two synthetic products only. No order is created and your basket stays unchanged.</p>
    <p>The server verifies the signed-in owner and approved profile when you run validation.</p>
    <div className="archive-validation-controls">
      <label>Fixture<select value={sku} disabled={busy} onChange={event => changeSelection(() => setSku(event.target.value))}>{fixtureSkus.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Quantity<select value={qty} disabled={busy} onChange={event => changeSelection(() => setQty(Number(event.target.value)))}>{Array.from({ length: 10 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" disabled={busy || !!issue} onClick={run}>{busy ? 'Validating…' : 'Run validation'}</button>
    </div>
    {issue && <p role="status">{issue === 'ARCHIVE_CHECKOUT_OWNER_REQUIRED' ? 'This test requires the pinned owner account.' : 'An unexpired signed-in session is required. This panel does not renew your session.'}</p>}
    <div className="archive-validation-result" role="status" aria-live="polite" aria-atomic="true">
      {busy && <p>Checking identity, profile and fixture…</p>}
      {result && <>
        <p><strong>{result.ok ? 'Validation passed' : 'Validation did not pass'}</strong>{result.status !== null && ` · HTTP ${result.status}`}</p>
        {!result.ok && <p>Code: {result.code}</p>}
        <p>Writes performed: {result.writesPerformed === false ? 'false' : 'unverified'}</p>
        {result.ok && <dl><dt>Fixture / quantity</dt><dd>{result.sku} / {result.qty}</dd><dt>Price</dt><dd>R{result.price.toFixed(2)}</dd><dt>Source commit</dt><dd>{result.sourceCommit}</dd><dt>Deployment</dt><dd>{result.deploymentId}</dd></dl>}
      </>}
    </div>
  </section>;
}
