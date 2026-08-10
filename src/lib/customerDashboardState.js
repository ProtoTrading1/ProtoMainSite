export const BASKET_ACTIVE = 'BASKET_ACTIVE';
export const FIRST_LOGIN = 'FIRST_LOGIN';
export const RETURNING_BUYER = 'RETURNING_BUYER';
export const RETURNING_NO_ORDER = 'RETURNING_NO_ORDER';

export const CUSTOMER_DASHBOARD_STATE_KEYS = Object.freeze({
  BASKET_ACTIVE,
  FIRST_LOGIN,
  RETURNING_BUYER,
  RETURNING_NO_ORDER,
});

export const CUSTOMER_DASHBOARD_DISMISS_MS = Object.freeze({
  BASKET_ACTIVE: null,
  FIRST_LOGIN: 5_000,
  RETURNING_BUYER: 3_000,
  RETURNING_NO_ORDER: 4_000,
});

const safeFirstName = (value) => {
  if (typeof value !== 'string') return 'there';

  const [firstName] = value.trim().split(/\s+/);
  return firstName || 'there';
};

const safeCount = (value) => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
};

const formatRand = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return `R ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const basketMessage = (itemCount, basketTotalInclVat) => {
  const itemLabel = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  const formattedTotal = formatRand(basketTotalInclVat);

  return formattedTotal
    ? `${itemLabel} · ${formattedTotal} incl. VAT`
    : itemLabel;
};

/**
 * Selects the customer dashboard experience without relying on React or browser APIs.
 * Precedence: active basket, first login, returning buyer, returning non-buyer.
 */
export const selectCustomerDashboardState = ({
  firstName,
  firstLogin = false,
  onlineOrderCount = 0,
  orderHistoryAvailable = true,
  basketRestoredAtLogin = false,
  basketItemCount = 0,
  basketTotalInclVat,
} = {}) => {
  const name = safeFirstName(firstName);
  const orders = safeCount(onlineOrderCount);
  const basketItems = safeCount(basketItemCount);
  const hasPreviousOrder = orders > 0;
  const isFirstLogin = firstLogin === true;

  if (basketRestoredAtLogin === true && basketItems > 0) {
    return Object.freeze({
      key: BASKET_ACTIVE,
      presentation: 'basket',
      eyebrow: 'YOUR BASKET',
      title: `Your basket is waiting, ${name}`,
      message: basketMessage(basketItems, basketTotalInclVat),
      primaryLabel: 'Review basket',
      secondaryLabel: null,
      dismissAfterMs: CUSTOMER_DASHBOARD_DISMISS_MS.BASKET_ACTIVE,
      buyAgain: hasPreviousOrder,
      popularCategories: !hasPreviousOrder,
      recentOrderEmpty: !hasPreviousOrder,
    });
  }

  if (isFirstLogin) {
    return Object.freeze({
      key: FIRST_LOGIN,
      presentation: 'toast',
      eyebrow: 'PROTO TRADING ONLINE',
      title: `Welcome to Proto Trading, ${name}`,
      message: 'Your wholesale account is ready.',
      primaryLabel: 'Browse catalogue',
      secondaryLabel: null,
      dismissAfterMs: CUSTOMER_DASHBOARD_DISMISS_MS.FIRST_LOGIN,
      buyAgain: false,
      popularCategories: true,
      recentOrderEmpty: true,
    });
  }

  // A temporary order-history failure must never tell an established customer
  // that they have not ordered. Keep the experience useful and neutral until
  // the next login can resolve their history correctly.
  if (orderHistoryAvailable !== true) {
    return Object.freeze({
      key: RETURNING_NO_ORDER,
      presentation: 'toast',
      eyebrow: 'WELCOME BACK',
      title: `Welcome back, ${name}`,
      message: 'Good to see you again.',
      primaryLabel: 'Continue shopping',
      secondaryLabel: null,
      dismissAfterMs: CUSTOMER_DASHBOARD_DISMISS_MS.RETURNING_BUYER,
      buyAgain: false,
      popularCategories: false,
      recentOrderEmpty: false,
    });
  }

  if (hasPreviousOrder) {
    return Object.freeze({
      key: RETURNING_BUYER,
      presentation: 'toast',
      eyebrow: 'WELCOME BACK',
      title: `Welcome back, ${name}`,
      message: 'Good to see you again.',
      primaryLabel: 'Continue shopping',
      secondaryLabel: null,
      dismissAfterMs: CUSTOMER_DASHBOARD_DISMISS_MS.RETURNING_BUYER,
      buyAgain: true,
      popularCategories: false,
      recentOrderEmpty: false,
    });
  }

  return Object.freeze({
    key: RETURNING_NO_ORDER,
    presentation: 'toast',
    eyebrow: 'WELCOME BACK',
    title: `Welcome back, ${name}`,
    message: 'Ready to place your first order?',
    primaryLabel: 'Explore products',
    secondaryLabel: null,
    dismissAfterMs: CUSTOMER_DASHBOARD_DISMISS_MS.RETURNING_NO_ORDER,
    buyAgain: false,
    popularCategories: true,
    recentOrderEmpty: true,
  });
};
