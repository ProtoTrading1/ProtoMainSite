export function cartSyncFailure(error) {
  const status = Number(error?.status) || 0;
  const message = String(error?.message || '');
  let code = 'cart_connection';
  let detail = 'We cannot confirm this basket on your account. Retry before switching devices.';
  if (error?.code === 'cart_response_unverified') {
    code = 'cart_response_unverified';
    detail = 'The account basket reply was incomplete. Your device basket is kept. Retry sync; if it continues, contact Proto with this support code. Do not clear either basket.';
  } else if (status === 409) {
    code = 'cart_conflict';
    detail = 'Another device saved a different basket. Your unsaved copy is kept on this device. Contact Proto before replacing either basket.';
  } else if (error?.code === 'cart_timeout') {
    code = 'cart_timeout';
    detail = 'The basket connection timed out. Your items remain on this device. Retry sync without clearing your basket.';
  } else if (status === 401 || /Not authenticated|Authentication timed out/i.test(message)) {
    code = 'cart_authentication';
    detail = 'Your account session could not be confirmed. Retry sync. If it continues, contact Proto before signing out or clearing this basket.';
  } else if (status === 403) {
    code = 'cart_permission';
    detail = 'Your account could not access its saved basket. Contact Proto; do not clear your basket or switch devices.';
  } else if ([400, 413, 422].includes(status)) {
    code = /quantity/i.test(message) ? 'cart_quantity'
      : /activity time/i.test(message) ? 'cart_activity'
      : /duplicate/i.test(message) ? 'cart_duplicate'
      : /revision/i.test(message) ? 'cart_revision'
      : /product lines/i.test(message) ? 'cart_line_limit' : 'cart_payload';
    detail = 'The saved basket needs a data check. Contact Proto with the code below. Keep this page open; do not clear your basket.';
  }
  return { code, detail, retryable: ![400, 401, 403, 409, 413, 422].includes(status) };
}
