export function createAuthBootstrapGuard() {
  let generation = 0;
  return {
    checkpoint: () => generation,
    acceptsBootstrap: checkpoint => generation === checkpoint,
    acceptEvent(event, checkpoint) {
      if (event === 'INITIAL_SESSION') return generation === checkpoint;
      generation += 1;
      return true;
    },
    markLogin() { generation += 1; },
  };
}

export function createAuthIdentityGuard() {
  let identity = { userId: null };
  return {
    checkpoint: () => identity,
    acceptUser(userId) {
      if (identity.userId === userId) return false;
      identity = { userId };
      return true;
    },
    acceptsProfile: (checkpoint, userId) => identity === checkpoint && identity.userId === userId,
  };
}
