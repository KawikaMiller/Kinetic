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

/** What decides whether an intro caption is set again: a string or number, or a list of values compared by value. */
export type IntroKey = string | number | DependencyList;

/** How deep `sameIntroValue` looks into arrays and plain objects before it gives up and says "different". */
const INTRO_KEY_DEPTH = 4;

/**
 * Whether two intro-key values are the same: primitives by `Object.is`, arrays and plain objects by their
 * contents (to `INTRO_KEY_DEPTH` levels), anything else (functions, class instances, JSX) by identity.
 * Comparing by contents is what stops a freshly built array or object, made again on every render, from
 * setting the caption on every render (a caption set re-renders the stage: an infinite loop).
 */
export function sameIntroValue(a: unknown, b: unknown, depth = INTRO_KEY_DEPTH): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0 || typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameIntroValue(v, b[i], depth - 1));
  }
  const plain = (o: object) => Object.getPrototypeOf(o) === Object.prototype;
  if (!plain(a) || !plain(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((k) => k in b && sameIntroValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth - 1));
}

const asList = (key: IntroKey): DependencyList => (typeof key === 'string' || typeof key === 'number' ? [key] : key);

/** True when `next` is the same intro key as `prev` (by value, see `sameIntroValue`). */
export const sameIntroKey = (prev: IntroKey, next: IntroKey): boolean => {
  const a = asList(prev);
  const b = asList(next);
  return a.length === b.length && a.every((v, i) => sameIntroValue(v, b[i]));
};

/**
 * Set the caption when the stage mounts, and again whenever `deps` change (by value: see `sameIntroKey`).
 * Replaces the `useEffect(() => setCaption(...), [setCaption])` intro in each lesson. Prefer a string or
 * number key (the sentence's own text, or a count) over a list.
 */
export function useIntroCaption(node: ReactNode, deps: IntroKey = []): void {
  const setCaption = useSetCaption();
  const latest = useRef(node);
  const shownFor = useRef<IntroKey | null>(null);
  useEffect(() => {
    latest.current = node;
  });
  // `node` is new JSX every render, so compare the caller's deps instead of the node.
  useEffect(() => {
    if (shownFor.current !== null && sameIntroKey(shownFor.current, deps)) return;
    shownFor.current = deps;
    setCaption(latest.current);
  });
}
