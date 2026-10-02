import { useCallback, useEffect, useState } from 'react';
import { clearRegistrationDraft, readRegistrationDraft, saveRegistrationDraft } from '../lib/registrationDraft.mjs';

export default function useRegistrationDraft(values, done) {
  // Session storage survives refresh, but stays scoped to this browser tab.
  const [candidate, setCandidate] = useState(() => {
    try { return readRegistrationDraft(sessionStorage); } catch { return null; }
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const [discardFailed, setDiscardFailed] = useState(false);
  const [completionCleanupFailed, setCompletionCleanupFailed] = useState(false);
  const retryCompletionCleanup = useCallback(() => {
    let removed = false;
    try { removed = clearRegistrationDraft(sessionStorage); } catch { /* unavailable storage */ }
    setCompletionCleanupFailed(!removed);
    return removed;
  }, []);
  const encoded = JSON.stringify(values);
  useEffect(() => {
    if (done) {
      retryCompletionCleanup();
      return;
    }
    if (candidate) return; // Do not overwrite a draft before Restore/Discard.
    const current = JSON.parse(encoded);
    if (!current.companyName && !current.contactName && !current.email) {
      try { setSaveFailed(!clearRegistrationDraft(sessionStorage)); } catch { setSaveFailed(true); }
      return;
    }
    let saved = false;
    try { saved = saveRegistrationDraft(sessionStorage, current); } catch { /* unavailable storage */ }
    setSaveFailed(!saved);
  }, [encoded, candidate, done, retryCompletionCleanup]);
  return {
    candidate, saveFailed, discardFailed, completionCleanupFailed, retryCompletionCleanup,
    restored: () => setCandidate(null),
    discard: () => {
      let removed = false;
      try { removed = clearRegistrationDraft(sessionStorage); } catch { /* unavailable storage */ }
      setDiscardFailed(!removed);
      if (removed) setCandidate(null);
    },
  };
}
