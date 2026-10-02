// Bound the entire request, including auth recovery and response consumption.
// A timeout is an uncertain write, never permission to replace/clear a basket.
export async function boundedCartRequest(run, timeoutMs = 15000) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('Account basket connection timed out. Retry sync without clearing your basket.');
      error.code = 'cart_timeout';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
