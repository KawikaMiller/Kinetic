import type { GraphNodeMark } from '../../components/GraphView';
import type { Tone } from '../../core/tone';
import type { Kind } from './model';

export const KIND_LABEL: Record<Kind, string> = {
  person: 'Person',
  system: 'Software system',
  external: 'External system',
  container: 'Container',
  component: 'Component',
  class: 'Class',
};

/** People are sky, the system in focus is --hi, external systems are --dim, then info, violet and amber down the levels. */
export const KIND_TONE: Record<Kind, Tone> = {
  person: 'sky',
  system: 'hi',
  external: 'dim',
  container: 'info',
  component: 'violet',
  class: 'amber',
};

export const kindMark = (kind: Kind | null): GraphNodeMark | null =>
  kind === null ? null : kind === 'system' ? { tone: 'hi', fill: 'solid' } : { tone: KIND_TONE[kind], fill: 'tint', tint: 26 };
