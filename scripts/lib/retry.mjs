// Transient browser failures that a second try fixes: a cold Vite server still transforming on the first
// request (navigation timeout), and a Vite full reload landing mid-script (execution context destroyed).
const TRANSIENT = /navigation timeout|timeout of \d+ ?ms exceeded|execution context was destroyed|navigating frame was detached/i;

/** True when an error is one of the transient failures above. */
export const isTransientBrowserError = (err) => TRANSIENT.test(String(err?.message ?? err));

/**
 * Run `fn`; on a transient browser error log one line saying so and run it once more. Any other error,
 * and a second transient one, propagates: a retry is never silent and never loops.
 */
export async function retryOnce(fn, label, log = console.warn) {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientBrowserError(err)) throw err;
    log(`[kinetic] ${label}: ${String(err?.message ?? err).split('\n')[0]}; retrying once`);
    return fn();
  }
}
