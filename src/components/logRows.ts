import type { ReactNode } from 'react';
import type { Tone } from '../core/tone';

export interface LogRow {
  /** Unique and stable (a generated counter): the React key and the scroll target. */
  id: string | number;
  /** A timestamp or tick, muted, before everything else. */
  at?: ReactNode;
  /** ERROR, WARN, INFO...: written out in bold, and it colours the row when `tone` is left out (ERROR red, WARN orange). */
  level?: string;
  tone?: Tone;
  /** Who logged it, in bold; `sourceTone` colours it. */
  source?: string;
  sourceTone?: Tone;
  text: ReactNode;
}

const LEVEL_TONE: Record<string, Tone> = { ERROR: 'bad', WARN: 'orange', WARNING: 'orange' };

/** The row's colour: the one it names, else the one its level implies, else the neutral grey rule. */
export const rowTone = (row: Pick<LogRow, 'tone' | 'level'>): Tone | undefined => row.tone ?? (row.level ? LEVEL_TONE[row.level.toUpperCase()] : undefined);

/** The newest `max` rows (all of them without a `max`). */
export const lastRows = <R,>(rows: readonly R[], max?: number): readonly R[] => (max === undefined ? rows : rows.slice(Math.max(0, rows.length - max)));

/** The one selectable row in the tab order: the row with this id, or the first when it is null or no longer shown. */
export const rowTabStop = (rows: readonly Pick<LogRow, 'id'>[], id: LogRow['id'] | null): number => Math.max(0, rows.findIndex((r) => r.id === id));
