import { useEffect, useRef } from 'react';

/** Call `cb` every `ms` milliseconds while `enabled`. Always calls the latest `cb`. */
export function useInterval(cb: () => void, ms: number, enabled = true): void {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => cbRef.current(), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}
