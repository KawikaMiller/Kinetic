import type { Tone } from '../../core/tone';
import { CLIENTS, type Op } from './model';

/** Each client row keeps its colour in every scene: a plain category, never a verdict colour. */
export const CLIENT_TONES: readonly Tone[] = ['amber', 'sky', 'pink'];
export const clientTone = (client: string): Tone => CLIENT_TONES[Math.max(0, CLIENTS.indexOf(client as (typeof CLIENTS)[number]))];

export interface HistoryBar {
  id: string;
  client: string;
  kind: 'write' | 'read';
  value: number;
  /** In the axis' own unit. */
  start: number;
  end: number;
  /** Text on the bar when the value is not known yet (a read still running). */
  label?: string;
}

/** A scene 1 style history as bars. A bar covers its slots, so it runs from the start of the invocation slot to the end of the response slot. */
export const barsFromOps = (ops: readonly Op[]): HistoryBar[] =>
  ops.map((o) => ({ id: o.id, client: o.client, kind: o.kind, value: o.value, start: o.invoke, end: o.response + 1 }));
