import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { countsOf, type DomNode, type Patch, type PatchOp, type Scenario, type Step, type VNode } from './model';

export interface DiffFrame extends Frame {
  /** How many steps of the diff have run. */
  shown: number;
  /** The closing summary frame. */
  done: boolean;
}

/** How a node ended up, for colouring: a patch kind, or visited with nothing to do. */
export type NodeStatus = PatchOp | 'same';

export const PATCH_TONE = { update: 'info', replace: 'orange', insert: 'ok', move: 'violet', remove: 'bad' } as const satisfies Record<PatchOp, string>;
export const PATCH_LABEL: Record<PatchOp, string> = { update: 'UPDATE', replace: 'REPLACE', insert: 'INSERT', move: 'MOVE', remove: 'REMOVE' };

const findOld = (d: DomNode, id: number): DomNode | undefined => (d.id === id ? d : d.children.map((c) => findOld(c, id)).find(Boolean));
export const vAt = (v: VNode, path: string): VNode => path.split('.').slice(1).reduce((n, i) => n.children[Number(i)], v);

const tag = (type: string) => <code>&lt;{type}&gt;</code>;
const named = (type: string, text: string): ReactNode => (text ? <>{tag(type)} “{text}”</> : tag(type));
const chip = (op: PatchOp) => <span className={`hl ${PATCH_TONE[op]}`}>{PATCH_LABEL[op]}</span>;
const clsText = (c: string) => (c ? `class “${c}”` : 'no class');

/** Precedence when one step carries several patches: what the node is coloured as. */
const OP_ORDER: PatchOp[] = ['replace', 'remove', 'insert', 'move', 'update'];

/** Which nodes of each tree have been visited after `shown` steps, and how they ended up. */
export function nodeStatuses(s: Scenario, shown: number): { old: Map<number, NodeStatus>; next: Map<string, NodeStatus> } {
  const old = new Map<number, NodeStatus>();
  const next = new Map<string, NodeStatus>();
  for (const step of s.result.steps.slice(0, shown)) {
    const op = OP_ORDER.find((o) => step.patches.some((p) => p.op === o)) ?? 'same';
    const whole: NodeStatus = step.kind === 'same' ? op : (step.kind as PatchOp);
    if (step.kind === 'same') {
      old.set(step.oldId!, op);
      next.set(step.newPath!, op);
    } else {
      for (const id of step.oldSubtree) old.set(id, whole);
      for (const p of step.newSubtree) next.set(p, whole);
    }
  }
  return { old, next };
}

function stepCaption(s: Scenario, step: Step): ReactNode {
  const oldNode = step.oldId === null ? null : findOld(s.old, step.oldId)!;
  const newNode = step.newPath === null ? null : vAt(s.next, step.newPath);
  const where = step.keyed ? `key ${step.key}` : `position ${step.newIndex ?? step.oldIndex}`;
  switch (step.kind) {
    case 'same': {
      const how =
        step.match === 'root' ? 'Compare the two roots.'
        : step.match === 'key' ? <>Children with key <code>{step.key}</code> are matched.</>
        : <>Children at position {step.newIndex} are matched.</>;
      const changes = step.patches.filter((p) => p.op === 'update').map((p) =>
        p.op === 'update' && p.field === 'text' ? <>text “{p.from}” → “{p.to}”</> : p.op === 'update' ? <>{clsText(p.from)} → {clsText(p.to)}</> : null,
      );
      return (
        <>
          {how} {named(oldNode!.type, oldNode!.text)} vs {named(newNode!.type, newNode!.text)}: same type, so node #{step.oldId} stays.{' '}
          {changes.length ? (
            <>
              It needs {chip('update')}: {changes.map((c, i) => <span key={i}>{i ? ', ' : ''}{c}</span>)}.
            </>
          ) : (
            'Nothing on it changed.'
          )}
          {step.moved && <> Another child that stays put was after it in the old list, so it must also {chip('move')} to sit after its new neighbour.</>}
        </>
      );
    }
    case 'replace':
      return (
        <>
          {tag(step.oldType)} vs {tag(step.type)}: different type. The old subtree ({plural(step.oldSubtree.length, 'node')}) is dropped and the new one ({plural(step.newSubtree.length, 'node')}) is built: one {chip('replace')}. The diff does not look inside, so
          everything below is rebuilt, even parts that look the same.
        </>
      );
    case 'insert':
      return (
        <>
          {step.keyed ? <>No old child has key <code>{step.key}</code>.</> : <>The old list has no child at {where}.</>} {chip('insert')} {named(step.type, newNode!.text)}.
        </>
      );
    case 'remove':
      return (
        <>
          {step.keyed ? <>No new child has key <code>{step.key}</code>.</> : <>The new list has no child at {where}.</>} {chip('remove')} {named(step.type, oldNode!.text)}.
        </>
      );
  }
}

export function diffFrames(s: Scenario, intro: ReactNode): DiffFrame[] {
  const { steps } = s.result;
  const c = countsOf(s.result);
  const summary =
    c.ops === 0 ? (
      <>Done: 0 DOM calls. The diff still compared {plural(c.compared, 'pair')} to find that out: re-rendering costs time, but it did not touch the DOM.</>
    ) : (
      <>
        Done: {plural(c.ops, 'DOM call')}
        {c.built ? `, ${plural(c.built, 'node')} built from scratch` : ''}; the diff compared {plural(c.compared, 'pair')}. The real DOM now matches the new tree.
      </>
    );
  return [
    { shown: 0, done: false, say: intro },
    ...steps.map((step, i): DiffFrame => ({ shown: i + 1, done: false, say: stepCaption(s, step) })),
    { shown: steps.length, done: true, say: summary },
  ];
}

/** One patch as a log line; `built` names a node the patch builds. */
export function describePatch(p: Patch, built: (id: number) => string): string {
  switch (p.op) {
    case 'update': return `UPDATE #${p.id} ${p.field === 'text' ? 'text' : 'class'} “${p.from}” → “${p.to}”`;
    case 'replace': return `REPLACE #${p.id} with ${built(p.node.id)}`;
    case 'insert': return `INSERT ${built(p.node.id)} ${p.after === null ? 'first in' : `after #${p.after} in`} #${p.parent}`;
    case 'move': return `MOVE #${p.id} ${p.after === null ? 'to the start of' : `after #${p.after} in`} #${p.parent}`;
    case 'remove': return `REMOVE #${p.id}`;
  }
}

export const nodeSummary = (n: DomNode): string => `<${n.type}> #${n.id}${n.text ? ` “${n.text}”` : ''}${n.children.length ? ` (+${n.children.length} children)` : ''}`;
