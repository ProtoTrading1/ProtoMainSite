import test from 'node:test';
import assert from 'node:assert/strict';
import { findUserByEmail } from '../api/_password-reset.js';

function customerLookup(data, error = null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data, error }),
              };
            },
          };
        },
      };
    },
  };
}

test('password reset resolves the Auth user from the customer row', async () => {
  const user = { id: 'customer-auth-id', email: 'customer@business.co.za' };
  let authScanCalled = false;
  const supabase = {
    ...customerLookup({ id: user.id, email: user.email }),
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: id === user.id ? user : null }, error: null }),
        listUsers: async () => {
          authScanCalled = true;
          return { data: { users: [] }, error: null };
        },
      },
    },
  };

  assert.deepEqual(await findUserByEmail(supabase, 'CUSTOMER@BUSINESS.CO.ZA'), user);
  assert.equal(authScanCalled, false);
});

test('password reset retains the Auth directory fallback for legacy users', async () => {
  const user = { id: 'legacy-auth-id', email: 'legacy@business.co.za' };
  let authScanCalled = false;
  const supabase = {
    ...customerLookup(null),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: null }, error: null }),
        listUsers: async () => {
          authScanCalled = true;
          return { data: { users: [user] }, error: null };
        },
      },
    },
  };

  assert.deepEqual(await findUserByEmail(supabase, user.email), user);
  assert.equal(authScanCalled, true);
});
