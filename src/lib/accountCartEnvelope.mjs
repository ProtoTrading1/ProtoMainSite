import { validStoredCartItems } from './cartStorage.mjs';

// A success status alone is not proof that the account basket was loaded.
// Reject an incomplete receipt before it can replace the device copy.
export function verifiedAccountCartEnvelope(data) {
  if (!validStoredCartItems(data?.items)
    || !Number.isSafeInteger(data.revision) || data.revision < 0) {
    const error = new Error('The account basket response could not be verified. Your device basket has been kept.');
    error.code = 'cart_response_unverified';
    throw error;
  }
  return data;
}
