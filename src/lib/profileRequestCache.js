export function createProfileRequestCache() {
  let current = { userId: null, accessToken: null, promise: null, profile: null };

  return {
    load({ userId, accessToken = null, request }) {
      const matches = current.userId === userId && current.accessToken === accessToken;
      if (matches && current.promise) return current.promise;
      if (matches && current.profile) return Promise.resolve(current.profile);

      const promise = Promise.resolve()
        .then(request)
        .then(
          (profile) => {
            if (current.promise === promise) {
              current.promise = null;
              current.profile = profile || null;
            }
            return profile;
          },
          (error) => {
            if (current.promise === promise) {
              current.promise = null;
              current.profile = null;
            }
            throw error;
          },
        );

      current = { userId, accessToken, promise, profile: null };
      return promise;
    },

    clear() {
      current = { userId: null, accessToken: null, promise: null, profile: null };
    },
  };
}
