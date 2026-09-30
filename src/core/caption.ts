import { createContext, useContext, useEffect, useRef, type DependencyList, type ReactNode } from 'react';

export interface CaptionState {
  node: ReactNode;
  /** Bumped on every loud set so the caption re-animates even for identical text. */
  version: number;
}

export interface CaptionOptions {
  /** Update the text in place with no exit/enter fade. For live readouts and per-keystroke updates. */
  quiet?: boolean;
}

export type SetCaption = (node: ReactNode, opts?: CaptionOptions) => void;

export const SetCaptionContext = createContext<SetCaption>(() => {});
export const CaptionContext = createContext<CaptionState>({ node: null, version: 0 });

/** Setter for the caption strip under the stage. Stable across renders. */
export const useSetCaption = () => useContext(SetCaptionContext);
export const useCaption = () => useContext(CaptionContext);

/**
 * Set the caption when the stage mounts, and again whenever `deps` change.
 * Replaces the `useEffect(() => setCaption(...), [setCaption])` intro in each lesson.
 */
export function useIntroCaption(node: ReactNode, deps: DependencyList = []): void {
  const setCaption = useSetCaption();
  const latest = useRef(node);
  const shownFor = useRef<DependencyList | null>(null);
  useEffect(() => {
    latest.current = node;
  });
  // `node` is new JSX every render, so compare the caller's deps instead of the node.
  useEffect(() => {
    const prev = shownFor.current;
    if (prev && prev.length === deps.length && prev.every((d, i) => Object.is(d, deps[i]))) return;
    shownFor.current = deps;
    setCaption(latest.current);
  });
}
