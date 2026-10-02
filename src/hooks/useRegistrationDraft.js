import { useEffect, useState } from 'react';
import { clearRegistrationDraft, readRegistrationDraft, saveRegistrationDraft } from '../lib/registrationDraft.mjs';

export default function useRegistrationDraft(values, done) {
  // Session storage survives refresh, but stays scoped to this browser tab.
  const [candidate, setCandidate] = useState(() => {
    try { return readRegistrationDraft(sessionStorage); } catch { return null; }
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const encoded = JSON.stringify(values);
  useEffect(() => {
    if (done) {
      try { clearRegistrationDraft(sessionStorage); } catch { /* unavailable storage */ }
      return;
    }
    if (candidate) return; // Do not overwrite a draft before Restore/Discard.
    const current = JSON.parse(encoded);
    if (!current.companyName && !current.contactName && !current.email) return;
    let saved = false;
    try { saved = saveRegistrationDraft(sessionStorage, current); } catch { /* unavailable storage */ }
    setSaveFailed(!saved);
  }, [encoded, candidate, done]);
  return {
    candidate, saveFailed,
    restored: () => setCandidate(null),
    discard: () => {
      try { clearRegistrationDraft(sessionStorage); } catch { /* unavailable storage */ }
      setCandidate(null);
    },
  };
}
