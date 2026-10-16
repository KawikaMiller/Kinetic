import type { P } from './hull';

/** The turn-test plane runs from -TURN_DOMAIN to TURN_DOMAIN on both axes. */
export const TURN_DOMAIN = 10;

export interface TurnPreset {
  id: 'left' | 'right' | 'collinear';
  label: string;
  points: P[];
}

const A: P = { x: -6, y: -4 };
const B: P = { x: 4, y: -2 };
const C: P = { x: -1, y: 6 };

export const TURN_PRESETS: TurnPreset[] = [
  { id: 'left', label: 'Left turn', points: [A, B, C] },
  { id: 'right', label: 'Right turn', points: [A, C, B] },
  { id: 'collinear', label: 'Exactly collinear', points: [A, { x: 0, y: 0 }, { x: 6, y: 4 }] },
];

/** Scene 1 opens on the left-turn preset. */
export const TURN_OPEN: P[] = TURN_PRESETS[0].points;
