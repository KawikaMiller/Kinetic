import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { RATE_SEEDS, buildFrames, deadlockCount, type DlFrame } from './frames';
import { LAYOUTS, tagAt } from './layout';
import { ALL_ON, PRESETS, ragEdges, type Backoff, type ConditionKey, type Conditions, type PresetId, type RunOptions, type ThreadState } from './model';
import './styles.css';

const STEP_MS = 900;
const R = 22;
const BOX = { w: 66, h: 32 };
/** The dining table is the one graph too wide to shrink onto a phone. */
const DINING_MIN_WIDTH = 420;
/** Tag text centre, this far out from a thread's centre. */
const TAG_GAP = R + 14;

const PRESET_OPTIONS = (Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }));

const TOGGLES: { key: ConditionKey; label: string; on: string; off: string }[] = [
  { key: 'mutualExclusion', label: 'Mutual exclusion', off: 'Exclusive locks', on: 'Shared read-only copy' },
  { key: 'holdAndWait', label: 'Hold and wait', off: 'One lock at a time', on: 'All locks at once' },
  { key: 'noPreemption', label: 'No preemption', off: 'Wait forever', on: 'tryLock, give back' },
  { key: 'circularWait', label: 'Circular wait', off: 'Any order', on: 'One global order' },
];

function statusText(t: ThreadState, c: Conditions, frozen: boolean): string {
  if (frozen) return 'deadlocked';
  switch (t.status) {
    case 'idle': return 'not started';
    case 'waiting': return c.noPreemption ? 'asleep on a lock' : 'tryLock failed';
    case 'backoff': return 'backing off';
    case 'aborted': return 'rolled back';
    case 'done': return 'done';
    default: return t.pc >= t.order.length ? 'working' : 'ready';
  }
}

function Badge({ at, text, tone }: { at: { x: number; y: number }; text: string; tone: string }) {
  return (
    <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" className={`dl-badge tone-${tone}`}>
      {text}
    </text>
  );
}

export function Stage() {
  const [preset, setPreset] = useState<PresetId>('two');
  const [conditions, setConditions] = useState<Conditions>(ALL_ON);
  const [order, setOrder] = useState<'turns' | 'random'>('turns');
  const [seed, setSeed] = useState(1);
  const [backoff, setBackoff] = useState<Backoff>('random');

  const options: RunOptions = useMemo(
    () => ({ conditions, schedule: order === 'turns' ? { kind: 'turns' } : { kind: 'random', seed }, backoff, backoffSeed: seed }),
    [conditions, order, seed, backoff],
  );
  const frames = useMemo(() => buildFrames(preset, options), [preset, options]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f: DlFrame = player.frame;
  const rate = useMemo(() => deadlockCount(preset, conditions), [preset, conditions]);

  const p = PRESETS[preset];
  const layout = LAYOUTS[preset];
  const edges = ragEdges(f);
  const frozen = f.note.kind === 'deadlock';
  const cycleEdge = (from: string, to: string) => {
    const c = f.cycle;
    if (!c) return false;
    const i = c.indexOf(from);
    return i >= 0 && c[(i + 1) % c.length] === to;
  };
  const thread = (id: string) => f.threads.find((t) => t.id === id);

  const nodeMark = (id: string): GraphNodeMark | null => {
    const t = thread(id);
    if (!t) return { tone: 'violet', fill: 'tint', tint: 26 };
    if (id === f.active) return { tone: 'hi', fill: 'solid' };
    if (t.status === 'done') return { tone: 'ok', fill: 'solid' };
    if (t.status === 'aborted') return { tone: 'orange', fill: 'solid' };
    if (t.status === 'backoff' || t.status === 'idle') return { tone: 'dim', fill: 'tint' };
    return { tone: 'info', fill: 'tint', tint: 26 };
  };
  const edgeMark = (e: { from: string; to: string }, i: number): GraphEdgeMark => {
    const request = edges[i].kind === 'request';
    if (cycleEdge(e.from, e.to)) return { tone: 'bad', dashed: request, width: 3.5 };
    return request ? { tone: 'info', dashed: true, width: 2.5 } : { tone: 'violet', width: 2.5 };
  };
  const badge = (id: string): ReactNode => {
    const t = thread(id);
    if (!t) return null;
    const at = tagAt(layout, layout.at[id], TAG_GAP);
    if (frozen && f.cycle?.includes(id)) return <Badge at={at} text="deadlocked" tone="bad" />;
    if (t.status === 'aborted') return <Badge at={at} text="rolled back" tone="orange" />;
    if (t.status === 'backoff') return <Badge at={at} text="backing off" tone="muted" />;
    return null;
  };

  const graph = (
    <GraphView
      nodes={[
        ...p.threads.map((t) => ({ id: t.id, at: layout.at[t.id] })),
        ...p.resources.map((r) => ({ id: r, at: layout.at[r], shape: 'box' as const })),
      ]}
      edges={edges.map((e) => ({ from: e.from, to: e.to }))}
      directed
      width={layout.width}
      height={layout.height}
      radius={R}
      box={BOX}
      arrowSize={6}
      nodeMark={nodeMark}
      edgeMark={edgeMark}
      renderNode={(n, _at, base) => <>{base}{badge(n.id)}</>}
      className="dl-graph"
      ariaLabel={`Resource-allocation graph: ${edges.length ? edges.map((e) => `${e.from} ${e.kind === 'request' ? 'requests' : 'is held by'} ${e.to}`).join('; ') : 'no locks held or requested'}`}
    />
  );

  const done = f.threads.filter((t) => t.status === 'done').length;
  const asleep = f.threads.filter((t) => t.status === 'waiting' && conditions.noPreemption).length;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Tick" value={f.tick} color="var(--hi)" />
          <Stat label="Finished" value={`${done} of ${f.threads.length}`} color={done === f.threads.length ? 'var(--ok)' : 'var(--muted)'} />
          <Stat label="Asleep on a lock" value={asleep} color={frozen ? 'var(--bad)' : 'var(--muted)'} />
          <Stat
            label="Random orders that deadlock"
            value={`${rate} of ${RATE_SEEDS}`}
            color={rate ? 'var(--bad)' : 'var(--ok)'}
            sub={p.detector ? 'counting detector aborts' : 'seeded, these settings'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'thread', shape: 'dot' },
            { color: 'var(--violet)', label: 'resource (lock)', shape: 'square' },
            { color: 'var(--hi)', label: 'acting now', shape: 'dot' },
            { color: 'var(--info)', label: 'dashed: requests', shape: 'line' },
            { color: 'var(--violet)', label: 'solid: held by', shape: 'line' },
            { color: 'var(--bad)', label: 'wait cycle', shape: 'line' },
            { color: 'var(--ok)', label: 'finished', shape: 'dot' },
            ...(p.detector ? [{ color: 'var(--orange)', label: 'rolled-back victim', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <Segmented key="p" label="Scenario" value={preset} onChange={setPreset} options={PRESET_OPTIONS} />,
        <>
          {TOGGLES.map((t) => (
            <Toggle
              key={t.key}
              label={t.label}
              value={!conditions[t.key]}
              onChange={(broken) => setConditions({ ...conditions, [t.key]: !broken })}
              off={t.off}
              on={t.on}
            />
          ))}
        </>,
        <>
          <Segmented
            label="Schedule"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'turns', label: 'Take turns' },
              { value: 'random', label: 'Random order' },
            ]}
          />
          {!conditions.noPreemption && (
            <Segmented
              label="Retry delay"
              value={backoff}
              onChange={setBackoff}
              options={[
                { value: 'fixed', label: 'Fixed' },
                { value: 'random', label: 'Random' },
              ]}
            />
          )}
          {(order === 'random' || (!conditions.noPreemption && backoff === 'random')) && (
            <ChipButton tone="info" size="md" onClick={() => setSeed(seed + 1)}>
              Seed {seed}: try another
            </ChipButton>
          )}
        </>,
      ]}
    >
      <div className="dl stage-pad">
        <div className="dl-main">
          {preset === 'dining' ? (
            <WideRegion minWidth={DINING_MIN_WIDTH} label="Dining table graph: scroll sideways to see all of it">
              {graph}
            </WideRegion>
          ) : (
            graph
          )}
        </div>
        <div className="dl-side">
          <table className="data-table dl-table">
            <thead>
              <tr>
                <th>{p.detector ? 'Transaction' : 'Thread'}</th>
                <th>Holds</th>
                <th>Wants</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {f.threads.map((t) => {
                const stuck = frozen && !!f.cycle?.includes(t.id);
                return (
                  <tr key={t.id} className={t.id === f.active ? 'is-active' : ''}>
                    <td>{t.id}</td>
                    <td>{t.holds.join(', ') || '–'}</td>
                    <td>{t.wants.join(', ') || '–'}</td>
                    <td className={stuck ? 'dl-bad' : t.status === 'done' ? 'dl-ok' : t.status === 'aborted' ? 'dl-orange' : ''}>{statusText(t, conditions, stuck)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p.detector && <ConsolePanel title="database log" lines={f.log} empty="no errors yet" />}
        </div>
        <Hint block>
          Scripted lock sequences, one step per tick; "Take turns" runs the threads round-robin and "Random order" is seeded, so a seed always replays
          the same run. The stat tries {RATE_SEEDS} seeded random orders. The detector is a simplified model: it rolls back the transaction that began
          last, while real databases also weigh the work done (InnoDB rolls back the one with fewer changed rows; PostgreSQL says not to rely on which
          it picks). A third approach, avoidance (the Banker's algorithm), refuses any request that could lead to a deadlock; it isn't simulated here.
        </Hint>
      </div>
    </StageFrame>
  );
}
