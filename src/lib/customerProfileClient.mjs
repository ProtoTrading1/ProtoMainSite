import { requestJson, withDeadline } from './requestDeadline.mjs';

export async function loadCustomerProfile(userId, { headers, timeoutMs = 8000 } = {}) {
  try {
    return await withDeadline(async () => {
      const json = await requestJson(`/api/customer-profile?userId=${encodeURIComponent(userId)}`, {
        headers: typeof headers === 'function' ? await headers() : headers,
      }, { timeoutMs, message: 'Your trade account is taking too long to load.' });
      if (!json.profile) {
        const error = new Error(json.error || 'Your trade account could not be loaded.');
        error.code = json.code || 'CUSTOMER_PROFILE_LOOKUP_FAILED'; throw error;
      }
      return json.profile;
    }, { timeoutMs, message: 'Your trade account is taking too long to load.' });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'REQUEST_TIMEOUT') {
      const timeout = new Error('Your trade account is taking too long to load.');
      timeout.code = 'CUSTOMER_PROFILE_TIMEOUT'; throw timeout;
    }
    throw error;
  }
}
