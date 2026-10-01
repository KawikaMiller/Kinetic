// Shared data for the symmetric and asymmetric lanes: the texts, where things sit, and the
// frame shapes. Frame builders (with captions) are in keyFrames.tsx.
import type { Frame } from '../../core/types';

export const MESSAGE = 'Meet at 6pm';
export const RELEASE = 'Release v2.1';
export const TAMPERED = 'Release v2.1 + evil.exe';

export type Where = 'alice' | 'wire' | 'bob';
/** Horizontal positions across the scene, in percent. The wire runs from Alice to Bob. */
export const POS: Record<Where, number> = { alice: 14, wire: 50, bob: 86 };
export const X: Record<Where, string> = { alice: `${POS.alice}%`, wire: `${POS.wire}%`, bob: `${POS.bob}%` };
/** Left/right insets that span Alice → Bob, for the wire and the question banner. */
export const SPAN = { left: X.alice, right: `${100 - POS.bob}%` };
/** Narrowest scene that fits three people side by side; phones scroll sideways. */
export const KEY_SCENE_MIN_WIDTH = 680;

/**
 * Where the message card goes. At either end it's pinned by its outer edge (a long card such
 * as the tampered release would otherwise hang off the stage); on the wire it's centred.
 */
export function cardPlacement(at: Where): { left: string; x: string } {
  if (at === 'alice') return { left: '2%', x: '0%' };
  if (at === 'bob') return { left: '98%', x: '-100%' };
  return { left: X.wire, x: '-50%' };
}

export interface SymFrame extends Frame {
  keys: boolean;
  at: Where | null;
  locked: boolean;
  eve: boolean;
  opened: boolean;
  question: boolean;
}

export type Sign = 'none' | 'signed' | 'verified' | 'tampered';

export interface AsymFrame extends Frame {
  pair: boolean;
  published: boolean;
  at: Where | null;
  locked: boolean;
  eveTry: boolean;
  opened: boolean;
  sign: Sign;
}
