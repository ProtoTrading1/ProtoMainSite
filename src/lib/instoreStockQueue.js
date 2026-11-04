// Shared by visible Instore cards and their detail panels. No result cache:
// every admitted task still uses the authenticated, no-store stock endpoint.
export function createInstoreStockQueue(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid stock check limit');
  let active = 0;
  const pending = [];
  const aborted = () => Object.assign(new Error('Stock check cancelled'), { name: 'AbortError' });
  function drain() {
    while (active < limit && pending.length) {
      const job = pending.shift();
      job.signal?.removeEventListener('abort', job.cancel);
      if (job.signal?.aborted) { job.reject(aborted()); continue; }
      active += 1;
      Promise.resolve().then(() => {
        if (job.signal?.aborted) throw aborted();
        return job.read();
      }).then(job.resolve, job.reject).finally(() => { active -= 1; drain(); });
    }
  }
  return (read, { signal } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return; }
    const job = { read, signal, resolve, reject };
    job.cancel = () => {
      const index = pending.indexOf(job);
      if (index >= 0) { pending.splice(index, 1); reject(aborted()); }
    };
    signal?.addEventListener('abort', job.cancel, { once: true });
    pending.push(job);
    drain();
  });
}
export const scheduleInstoreStockCheck = createInstoreStockQueue();
