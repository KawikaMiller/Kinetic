/** Hold the current thread for `ms` of real time. */
export function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* busy */
  }
}
