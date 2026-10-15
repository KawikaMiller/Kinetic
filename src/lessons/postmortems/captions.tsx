import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { FAULT_REASON, SENTENCES, correctIndex } from './blame';
import { checklist, type Item } from './actions';
import { FACTOR_IDS, KIND_LABEL, LEAF_IDS, factorOf, revealed } from './tree';
import { surfaced, type Chain } from './whys';

/** Scene 1: what the learner just asked, what it is tagged, and how much of the tree is on screen. */
export function factorsCaption(asked: ReadonlySet<string>, picked: string | null): ReactNode {
  const shown = revealed(asked);
  const found = FACTOR_IDS.filter((id) => shown.has(id)).length;
  const leaves = LEAF_IDS.filter((id) => shown.has(id)).length;
  if (!picked) return <>Start at the impact and press it: ask what made it possible. The tree has {FACTOR_IDS.length} factors in all, and none of them is the single root cause.</>;
  const f = factorOf(picked);
  const progress = (
    <>
      {found} of {FACTOR_IDS.length} factors found, {leaves} of {plural(LEAF_IDS.length, 'leaf', 'leaves')}.
    </>
  );
  if (f.kind === null) return <>You asked what made <b>the outage</b> possible: {plural(f.children.length, 'factor')} appeared. {progress}</>;
  if (f.children.length === 0) return <>You asked about a <b>{KIND_LABEL[f.kind]}</b> at the end of its branch: nothing more appears. {progress}</>;
  return <>You asked about a <b>{KIND_LABEL[f.kind]}</b>: {plural(f.children.length, 'more factor')} appeared. {progress}</>;
}

/** Scene 2: how many sentences are rewritten, and what the last pick still got wrong. */
export function blameCaption(picks: Readonly<Record<string, number>>, last: string | null): ReactNode {
  const done = SENTENCES.filter((s) => picks[s.id] === correctIndex(s)).length;
  const tail = <>{done} of {SENTENCES.length} sentences now name a condition instead of a person.</>;
  const sentence = SENTENCES.find((s) => s.id === last);
  if (!sentence || picks[sentence.id] === undefined) return <>Pick the rewrite that names a condition of the system. {tail}</>;
  const pick = sentence.rewrites[picks[sentence.id]];
  return pick.fault ? <>That rewrite is not it. {FAULT_REASON[pick.fault]} {tail}</> : <>That rewrite names a condition that can be fixed. {tail}</>;
}

/** Scene 3: how many checks the action list passes, and the first one it fails. */
export function actionsCaption(items: readonly Item[]): ReactNode {
  const checks = checklist(items);
  const passed = checks.filter((c) => c.pass).length;
  const first = checks.find((c) => !c.pass);
  if (items.length === 0) return <>No actions yet: add one from the slots, or load a preset. 0 of {checks.length} checks pass.</>;
  return first ? (
    <>
      {plural(items.length, 'action')}: {passed} of {checks.length} checks pass. First to fix: {first.label.toLowerCase()} ({first.detail}).
    </>
  ) : (
    <>
      {plural(items.length, 'action')}, and all {checks.length} checks pass: every leaf factor has an action, each with an owner role, a tag and a check someone can run.
    </>
  );
}

/** Scene 4: what one chain of whys found against the whole tree. */
export function whysCaption(chain: Chain, depth: number): ReactNode {
  const { factors, leaves } = surfaced(chain, depth);
  const stoppedAtPerson = depth >= chain.steps.length && chain.steps[chain.steps.length - 1].factor === null;
  return (
    <>
      {depth === 1 ? 'One why' : `${depth} whys`} along “{chain.label.toLowerCase()}” surface {factors.length} of the authored tree’s {FACTOR_IDS.length} factors and {plural(leaves.length, 'leaf', 'leaves')} of its {LEAF_IDS.length}.
      {stoppedAtPerson && <> The last step is a person, who is not one of the tree’s factors: this is the usual naive version of the technique.</>}
    </>
  );
}
