/**
 * Scene 4: the same facts walked as one chain of "why" questions. A chain follows one branch of the tree and
 * stops where the asker is satisfied; the tree keeps every branch. The chains are authored: each stops at a different depth,
 * and none has five whys because no branch of this tree is that deep. A step is a factor of the tree, or the one
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
    label: 'Stops at a person (the usual naive version)',
    steps: [
      { factor: ROOT, text: 'Why did checkout fail?' },
      { factor: 'pool-zero', text: 'Because a config change set the pool size to 0.' },
      { factor: null, text: 'Why? Because an engineer typed the wrong value. (Stop: human error.)' },
    ],
  },
  {
    id: 'trigger',
    label: 'Stops at the trigger',
    steps: [
      { factor: ROOT, text: 'Why did checkout fail?' },
      { factor: 'pool-zero', text: 'Because a config change set the pool size to 0. (Stop: revert it.)' },
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
    id: 'alerting',
    label: 'Follows the late alert',
    steps: [
      { factor: ROOT, text: 'Why did checkout fail for so long?' },
      { factor: 'slow-recovery', text: 'Because recovery took a long time.' },
      { factor: 'slow-alert', text: 'Why? The alert paged only after the error ratio had stayed high for a while.' },
      { factor: 'noisy-history', text: 'Why? The window was lengthened after an earlier alert paged for a one-minute blip.' },
    ],
  },
];

/** The tree factors (other than the impact) a chain surfaces in its first `n` steps, and the leaves among them. */
export function surfaced(chain: Chain, n: number): { factors: string[]; leaves: string[] } {
  const factors = chain.steps.slice(0, n).flatMap((s) => (s.factor !== null && FACTOR_IDS.includes(s.factor) ? [s.factor] : []));
  return { factors, leaves: factors.filter((f) => LEAF_IDS.includes(f)) };
}
