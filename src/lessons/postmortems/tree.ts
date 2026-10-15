/**
 * The invented incident of the postmortem lesson as data: a fixed, authored tree of contributing factors.
 * A config change set a connection pool size to 0 and took checkout down for 27 minutes. Nothing here is a
 * real incident; every minute and name is invented.
 */
import type { Tone } from '../../core/tone';
import type { TreeShape } from '../../core/treeLayout';

export type FactorKind = 'trigger' | 'contributing' | 'latent';
export const ROOT = 'impact';

/** Minutes from the first errors to the alert, and from the alert to the revert finishing. */
export const DETECT_MIN = 9;
export const REVERT_MIN = 18;
export const OUTAGE_MIN = DETECT_MIN + REVERT_MIN;

export interface Factor {
  id: string;
  /** Two short lines for the node. */
  short: [string, string];
  text: string;
  /** `null` for the impact at the root. */
  kind: FactorKind | null;
  children: readonly string[];
}

const f = (id: string, short: [string, string], text: string, kind: FactorKind | null, children: readonly string[] = []): Factor => ({ id, short, text, kind, children });

export const FACTORS: readonly Factor[] = [
  f(ROOT, ['checkout down', `${OUTAGE_MIN} minutes`], `Checkout failed for ${OUTAGE_MIN} minutes.`, null, ['pool-zero', 'all-at-once', 'slow-recovery']),
  f('pool-zero', ['pool size', 'set to 0'], 'A config change set the connection pool size to 0.', 'trigger', ['no-range', 'one-line-review']),
  f('no-range', ['no range', 'check'], 'The config tool does not check a value against a valid range.', 'latent', ['old-schema']),
  f('old-schema', ['schema checks', 'types only'], 'The schema was written to check types, and nobody was asked to own value ranges.', 'latent'),
  f('one-line-review', ['review saw', 'one line'], 'The review showed a one-line diff and no preview of what it would do.', 'contributing'),
  f('all-at-once', ['reached every', 'server'], 'The change reached every server within a minute.', 'contributing', ['no-stages', 'shared-file']),
  f('no-stages', ['no staged', 'rollout'], 'The config pipeline has no staged rollout and no health gate.', 'latent'),
  f('shared-file', ['one shared', 'config file'], 'All regions read one config file, so a change could not be tried on a few of them first.', 'latent'),
  f('slow-recovery', ['slow', 'recovery'], `Recovery took ${OUTAGE_MIN} minutes: ${DETECT_MIN} to be alerted and ${REVERT_MIN} to revert.`, 'contributing', ['slow-alert', 'manual-revert', 'stale-runbook']),
  f('slow-alert', ['alert waits', 'to be sure'], `The alert pages only after the error ratio has stayed high for a while, so it fired ${DETECT_MIN} minutes in.`, 'contributing', ['noisy-history']),
  f('noisy-history', ['window set', 'after a blip'], 'The alert window was lengthened after an earlier alert paged for a one-minute blip.', 'latent'),
  f('manual-revert', ['revert is', 'by hand'], 'Reverting meant finding the old value and pushing it by hand: there is no one-step rollback.', 'latent'),
  f('stale-runbook', ['runbook', 'out of date'], 'The runbook for config incidents described tooling that had since changed.', 'latent'),
];

export const factorOf = (id: string): Factor => FACTORS.find((x) => x.id === id)!;

export const FACTOR_SHAPE: TreeShape<string> = { root: ROOT, children: (id) => factorOf(id).children };

export const KIND_TONE: Record<FactorKind, Tone> = { trigger: 'orange', contributing: 'violet', latent: 'amber' };
export const KIND_LABEL: Record<FactorKind, string> = { trigger: 'trigger', contributing: 'contributing factor', latent: 'latent condition' };
export const KIND_EXPLAIN: Record<FactorKind, string> = {
  trigger: 'the event that set the outage off; it explains little on its own, because the conditions below it are what let it through',
  contributing: 'something present during the incident that made it larger, longer or likelier',
  latent: 'a condition that sat in the system before the incident, unnoticed until something triggered it',
};

/** Factors other than the impact. */
export const FACTOR_IDS: readonly string[] = FACTORS.filter((x) => x.id !== ROOT).map((x) => x.id);
export const LEAF_IDS: readonly string[] = FACTORS.filter((x) => x.children.length === 0).map((x) => x.id);

/** The nodes on screen once the learner has asked about the nodes in `asked`: the root and the children of each asked node. */
export function revealed(asked: ReadonlySet<string>): Set<string> {
  const out = new Set<string>([ROOT]);
  for (const id of asked) for (const c of factorOf(id).children) out.add(c);
  return out;
}

/** The most answers any chain of whys can have in this tree: factors on the deepest branch, the impact excluded. */
export const MAX_WHYS = (() => {
  const depth = (id: string): number => 1 + Math.max(0, ...factorOf(id).children.map(depth));
  return depth(ROOT) - 1;
})();
