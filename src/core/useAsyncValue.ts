import { useEffect, useRef, useState } from 'react';

/**
 * Resolve an async value whenever `key` changes. Returns null while pending, and
 * never returns a result computed for an older key (no flashes of stale data).
 *
 *   const digest = useAsyncValue(() => sha256Hex(text), text);
 */
export function useAsyncValue<T>(fn: () => Promise<T>, key: string | number): T | null {
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

  return out && out.key === key ? out.value : null;
}
