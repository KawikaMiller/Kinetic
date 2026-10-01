import { useCallback, useSyncExternalStore } from 'react';

/** Phone layouts: matches the `@media (max-width: 600px)` rules in the stylesheets. */
export const PHONE_QUERY = '(max-width: 600px)';

/**
 * Whether a CSS media query matches, kept live as the window resizes. For layout
 * choices CSS can't make, like how many bytes an SVG hex dump puts on a row.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
