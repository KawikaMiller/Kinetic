import { useEffect, useRef, useState } from 'react';
import type { Analysis, AnalyzeRequest } from './model';

/** A pattern that hasn't finished by now is stopped and reported as too slow. */
export const TIMEOUT_MS = 500;

export interface AnalysisState {
  /** 'slow' means the worker was stopped: the pattern backtracked for too long. */
  status: 'pending' | 'ready' | 'slow';
  /** The latest finished analysis; kept while the next one is computing, so nothing flickers. */
  analysis: Analysis | null;
}

const spawn = () => new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });

/** Analyze `req` in a worker, with a timeout that terminates a runaway pattern. */
export function useRegexAnalysis(req: AnalyzeRequest): AnalysisState {
  const [state, setState] = useState<AnalysisState>({ status: 'pending', analysis: null });
  const worker = useRef<Worker | null>(null);
  const key = JSON.stringify(req);

  useEffect(() => {
    const w = worker.current ?? spawn();
    worker.current = w;
    let done = false;
    const stop = () => {
      w.terminate();
      if (worker.current === w) worker.current = null;
    };
    const timer = setTimeout(() => {
      done = true;
      stop();
      setState({ status: 'slow', analysis: null });
    }, TIMEOUT_MS);
    w.onmessage = (e: MessageEvent<Analysis>) => {
      done = true;
      clearTimeout(timer);
      setState({ status: 'ready', analysis: e.data });
    };
    w.postMessage(JSON.parse(key) as AnalyzeRequest);
    return () => {
      clearTimeout(timer);
      w.onmessage = null;
      // Still busy with this request: start the next one on a fresh worker rather than queue behind it.
      if (!done) stop();
    };
  }, [key]);

  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );

  return state;
}
