import { useEffect, useRef, useState } from 'react';

/**
 * Resolve an async value whenever `key` changes. Returns null while pending, and
 * never returns a result computed for an older key (no flashes of stale data).
 * With `keepPrevious`, it keeps returning the last result until the new one lands,
 * so fast-changing input (typing) doesn't flicker through null.
 *
 *   const digest = useAsyncValue(() => sha256Hex(text), text);
 */
export function useAsyncValue<T>(fn: () => Promise<T>, key: string | number, opts: { keepPrevious?: boolean } = {}): T | null {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const [out, setOut] = useState<{ key: string | number; value: T } | null>(null);

  useEffect(() => {
    let alive = true;
    fnRef.current().then((value) => {
      if (alive) setOut({ key, value });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!out) return null;
  return opts.keepPrevious || out.key === key ? out.value : null;
}
