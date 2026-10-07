// The lesson's deliberate lag. It blocks the main thread on purpose, to make lag spikes and
// expensive updates real; nothing else in the app does this.

/** Spin for `ms` milliseconds without yielding. */
export function busyWait(ms: number): void {
  if (ms <= 0) return;
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Spinning is the point: the frame really takes this long.
  }
}
