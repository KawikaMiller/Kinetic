import { useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { canvasCaption, conflictText } from './captions';
import {
  ACTIONS, CONFLICTS, DIAGNOSES, KIND_OF, POLICIES, SUPPORT_EDGES, describe, read, toggle, type NodeId,
} from './model';
import { OPENING } from './opening';

const CANVAS_MIN_WIDTH = 620;
const BOX = { w: 64, h: 34 } as const;
const SPACING = { direction: 'right', layerGap: 150, nodeGap: 46, padMain: 50, padCross: 30 } as const;
const NODES = [...DIAGNOSES, ...POLICIES, ...ACTIONS].map((n) => ({ id: n.id as string, label: n.id, shape: 'box' as const }));
const SUPPORT = SUPPORT_EDGES.map(([from, to]) => ({ from, to }));
const GROUPS: { title: string; items: readonly { id: NodeId; text: string }[] }[] = [
  { title: 'Diagnoses (fixed: the starting point)', items: DIAGNOSES },
  { title: 'Guiding policies', items: POLICIES },
  { title: 'Roadmap actions', items: ACTIONS },
];

/** Scene 1: the strategy canvas. Remove a policy or an action and see what it orphans, uncovers or conflicts with. */
export function CanvasScene({ picker }: { picker: ReactNode }) {
  const [removed, setRemoved] = useState<ReadonlySet<NodeId>>(OPENING.removed);
  const reading = read(removed);
  const present = (id: string) => !removed.has(id as NodeId);
  const activeConflicts = reading.conflicts.map(([a, b]) => ({ from: a as string, to: b as string }));
  const isConflict = (e: { from: string; to: string }) => CONFLICTS.some(([a, b]) => a === e.from && b === e.to);
  const key = [...removed].sort().join(',');

  return (
    <StageFrame
      height={860}
      intro={canvasCaption(removed, reading)}
      introKey={key}
      stats={
        <Stats>
          <Stat label="Orphaned actions" value={reading.orphans.length} color={reading.orphans.length ? 'var(--bad)' : undefined} sub={reading.orphans.length ? `${reading.orphans.join(', ')}: no policy supports this` : 'every action has a policy'} />
          <Stat label="Uncovered diagnoses" value={reading.uncovered.length} color={reading.uncovered.length ? 'var(--orange)' : undefined} sub={reading.uncovered.length ? `${reading.uncovered.join(', ')}: no policy answers this` : 'every diagnosis has a policy'} />
          <Stat label="Active conflicts" value={reading.conflicts.length} color={reading.conflicts.length ? 'var(--bad)' : undefined} sub={reading.conflicts.length ? reading.conflicts.map(([a, b]) => `${a} against ${b}`) : 'none'} />
        </Stats>
      }
      legend={<Legend items={[
        { color: 'var(--info)', label: 'diagnosis' }, { color: 'var(--violet)', label: 'guiding policy' }, { color: 'var(--muted)', label: 'action' },
        { color: 'var(--bad)', label: 'orphaned action, or a conflict (dashed)' }, { color: 'var(--orange)', label: 'uncovered diagnosis' }, { color: 'var(--dim)', label: 'removed' },
      ]}
      />}
      controls={[<>{picker}</>]}
    >
      <div className="ts-stage stage-pad">
        <WideRegion minWidth={CANVAS_MIN_WIDTH}>
          <GraphView
            nodes={NODES}
            edges={[...SUPPORT, ...activeConflicts]}
            layoutEdges={SUPPORT}
            directed
            layout="layered"
            spacing={SPACING}
            box={BOX}
            edgeStyle="curve"
            nodeMark={(id) => {
              if (!present(id)) return { tone: 'dim', fill: 'tint' };
              if (reading.orphans.includes(id as never)) return { tone: 'bad', fill: 'tint', tint: 30 };
              if (reading.uncovered.includes(id as never)) return { tone: 'orange', fill: 'tint', tint: 30 };
              const kind = KIND_OF[id];
              return { tone: kind === 'diagnosis' ? 'info' : kind === 'policy' ? 'violet' : 'muted', fill: 'tint' };
            }}
            edgeMark={(e) => (isConflict(e) ? { tone: 'bad', dashed: true } : !present(e.from) || !present(e.to) ? { tone: 'dim' } : null)}
            ariaLabel="The strategy canvas: diagnoses lead to guiding policies, which lead to roadmap actions; conflicts are dashed red lines"
          />
        </WideRegion>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h4 className="ts-h">{g.title}</h4>
            <ul className="ts-list">
              {g.items.map((n) => {
                const removable = KIND_OF[n.id] !== 'diagnosis';
                return (
                  <li key={n.id} className={`ts-row${present(n.id) ? '' : ' is-removed'}`}>
                    <b>{n.id}</b>
                    <span className="ts-text">{n.text}</span>
                    <span className="ts-state">{describe(removed, n.id, reading)}</span>
                    {removable && <Button onClick={() => setRemoved((r) => toggle(r, n.id))}>{present(n.id) ? 'Remove' : 'Restore'}<span className="sr-only"> {n.id}</span></Button>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section>
          <h4 className="ts-h">Conflicts</h4>
          <ul className="ts-list">
            {CONFLICTS.map((c) => {
              const active = reading.conflicts.includes(c);
              return <li key={c.join('-')} className="ts-row"><span className="ts-text">{conflictText(c)}</span><span className="ts-state">{active ? 'active: both ends present' : 'cleared: an end is removed'}</span></li>;
            })}
          </ul>
          <p className="ts-note">An orphaned action still counts as present, so a conflict with it stays active until the action itself is removed.</p>
        </section>
        <ProvenanceRow>
          <Provenance kind="invented">Acme Platform, its diagnoses, policies and actions are made up; no real company&apos;s strategy is described</Provenance>
          <ClaimLabel kind="view">the kernel of diagnosis, guiding policy and coherent action is one author&apos;s framework</ClaimLabel>
          <Provenance kind="from-memory">Richard Rumelt, Good Strategy Bad Strategy, 2011; verify against the book</Provenance>
          <ClaimLabel kind="view">a goal or a list of projects is not a policy: a policy rules some actions out</ClaimLabel>
          <ClaimLabel kind="practice">a paved road for build and deploy is a common platform pattern</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

