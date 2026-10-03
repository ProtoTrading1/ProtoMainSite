import { useState } from 'react';
import { requestJson } from '../lib/requestDeadline.mjs';
import ProtoLogo from '../components/ProtoLogo';
import './ResetPasswordPage.css';
import './TradeEmailVerification.css';

export default function VerifyEmailPage({ tokenHash, onSignIn }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const verified = await requestJson('/api/verify-trade-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenHash }),
      }, { timeoutMs: 15000, message: 'We could not confirm whether verification completed. Try signing in, or request a new confirmation email.' });
      setResult(verified);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/verify-email`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <main className="reset-password-page">
      <section className="reset-password-card" aria-labelledby="verify-email-heading">
        <div className="reset-password-accent" />
        <div className="reset-password-body">
        <ProtoLogo variant="full" size="md" tagline={false} className="reset-password-logo" />
        <h1 id="verify-email-heading">{result ? 'Your email is confirmed' : 'Confirm your email'}</h1>
        <p className="reset-password-intro" role={result ? 'status' : undefined}>{result ? (result.approved ? 'Your trade account is approved. Sign in to browse the catalogue.' : 'Your application is with the Proto team. We will notify you when it is approved.')
          : 'Confirm that this email belongs to you to complete your trade application.'}</p>
        {error && <p className="reset-password-error" role="alert">{error}</p>}
        {!result && tokenHash && <button type="button" className="reset-password-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : 'Confirm my email'}</button>}
        {!tokenHash && !result && <p className="reset-password-status">This link is incomplete. Request a new confirmation email from sign in.</p>}
        <button type="button" className="trade-email-secondary" onClick={onSignIn} disabled={busy}>Go to sign in</button>
        </div>
      </section>
    </main>
  );
}
