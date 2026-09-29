import { createContext, useContext, type ReactNode } from 'react';

export interface CaptionState {
  node: ReactNode;
  /** Bumped on every set so the caption re-animates even for identical text. */
  version: number;
}

export const SetCaptionContext = createContext<(node: ReactNode) => void>(() => {});
export const CaptionContext = createContext<CaptionState>({ node: null, version: 0 });

/** Setter for the caption strip under the stage. Stable across renders. */
export const useSetCaption = () => useContext(SetCaptionContext);
export const useCaption = () => useContext(CaptionContext);
