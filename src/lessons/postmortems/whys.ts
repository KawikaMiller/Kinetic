/**
 * Scene 4: the same facts walked as one chain of "why" questions. A chain follows one branch of the tree and
 * stops where the asker is satisfied; the tree keeps every branch. A step is a factor of the tree, or the one
 * convenient stopping point (a person) that is not a factor.
 */
import { FACTOR_IDS, LEAF_IDS, ROOT } from './tree';

export interface WhyStep {
  /** A factor of the tree, or null for the stop at a person. */
  factor: string | null;
  text: string;
}

export interface Chain {
  id: string;
  label: string;
  steps: readonly WhyStep[];
}

export const CHAINS: readonly Chain[] = [
  {
    id: 'person',
    label: 'Stops at a person',
    steps: [
      { factor: ROOT, text: 'Why did checkout fail?' },
      { factor: 'pool-zero', text: 'Because a config change set the pool size to 0.' },
      { factor: null, text: 'Why? Because an engineer typed the wrong value. (Stop: human error.)' },
    ],
  },
  {
    id: 'schema',
    label: 'Follows the config checks',
    steps: [
      { factor: ROOT, text: 'Why did checkout fail?' },
      { factor: 'pool-zero', text: 'Because a config change set the pool size to 0.' },
      { factor: 'no-range', text: 'Why was 0 accepted? The config tool does not check a value against a valid range.' },
      { factor: 'old-schema', text: 'Why not? The schema checks types, and nobody was asked to own value ranges.' },
    ],
  },
  {
    id: 'recovery',
    label: 'Follows the slow recovery',
    steps: [
      { factor: ROOT, text: 'Why did checkout fail for so long?' },
      { factor: 'slow-recovery', text: 'Because recovery took a long time.' },
      { factor: 'manual-revert', text: 'Why? Reverting meant finding the old value and pushing it by hand.' },
    ],
  },
];

/** The tree factors (other than the impact) a chain surfaces in its first `n` steps, and the leaves among them. */
export function surfaced(chain: Chain, n: number): { factors: string[]; leaves: string[] } {
  const factors = chain.steps.slice(0, n).flatMap((s) => (s.factor !== null && FACTOR_IDS.includes(s.factor) ? [s.factor] : []));
  return { factors, leaves: factors.filter((f) => LEAF_IDS.includes(f)) };
}
