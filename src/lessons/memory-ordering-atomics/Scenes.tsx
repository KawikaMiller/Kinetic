import type { ReactNode } from 'react';
import { LitmusScene, type SceneConfig } from './LitmusScene';

const CONFIGS: Readonly<Record<'sb' | 'mp' | 'bites', SceneConfig>> = {
  sb: { kind: 'sb', presets: ['sb'], lead: 'Two threads each store to one variable, then load the other one.' },
  mp: { kind: 'mp', presets: ['mp'], lead: 'One thread writes data, then sets a flag; the other reads the flag, then the data.' },
  bites: { kind: 'bites', presets: ['dekker', 'corr'], lead: 'Two programs on the same machinery: a Dekker-style entry check, and two reads of one location.' },
};

/** One component per scene, so no scene's state can carry over into another. */
export function BufferingScene({ picker }: { picker: ReactNode }) {
  return <LitmusScene picker={picker} config={CONFIGS.sb} />;
}
export function PassingScene({ picker }: { picker: ReactNode }) {
  return <LitmusScene picker={picker} config={CONFIGS.mp} />;
}
export function BitesScene({ picker }: { picker: ReactNode }) {
  return <LitmusScene picker={picker} config={CONFIGS.bites} />;
}
