import { readOnlyBrowserFetch } from './archive-test-browser-fetch.mjs';
// This branch is a catalogue-only preview; direct customer/Storage writes are blocked.
const authOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
globalThis.fetch = readOnlyBrowserFetch(globalThis.fetch.bind(globalThis), { origin: globalThis.location.origin, authOrigin, checkoutScope: import.meta.env.VITE_ARCHIVE_TEST_CHECKOUT_SCOPE });
