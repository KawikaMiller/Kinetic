import { useMemo, useState, type ReactNode } from 'react';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { layeredLayout, layeredPositions } from '../../core/graphLayout';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { PRESETS, RESOLVES, ROOT, type Lifetime, type PresetId, type Registration } from './container';
import { containerFrames } from './frames';
import { BOX } from './shared';

const STEP_MS = 1100;
const SPACING = { direction: 'down', layerGap: 92, nodeGap: 170, padMain: 34, padCross: 90 } as const;
const BADGE_DY = BOX.h / 2 + 14;
const LIFETIMES: { value: Lifetime; label: string }[] = [
  { value: 'transient', label: 'transient' },
  { value: 'singleton', label: 'singleton' },
];

const onPath = (path: readonly string[], from: string, to: string) => path.some((k, i) => k === from && path[i + 1] === to);
const inCycle = (cycle: readonly string[] | null, from: string, to: string) => !!cycle && onPath(cycle, from, to);

export function ContainerScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<PresetId>('shop');
  const [lifetimes, setLifetimes] = useState<Record<string, Lifetime>>(() => Object.fromEntries(PRESETS.shop.map((r) => [r.key, r.lifetime])));
  const regs: Registration[] = useMemo(() => PRESETS[preset].map((r) => ({ ...r, lifetime: lifetimes[r.key] ?? r.lifetime })), [preset, lifetimes]);
  const root = ROOT[preset];
  const frames = useMemo(() => containerFrames(regs, root, RESOLVES), [regs, root]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const edges = regs.flatMap((r) => r.deps.map((d) => ({ from: r.key, to: d })));
  // Laid out by the preset's own edges, so toggling a lifetime never moves a node.
  const placed = useMemo(() => {
    const base = PRESETS[preset];
    return layeredPositions(layeredLayout(base.map((r) => r.key), base.flatMap((r) => r.deps.map((d) => ({ from: r.key, to: d })))), SPACING);
  }, [preset]);
  const minWidth = minWidthForText(placed.width, 12);

  const load = (p: PresetId) => {
    setPreset(p);
    setLifetimes(Object.fromEntries(PRESETS[p].map((r) => [r.key, r.lifetime])));
  };

  const nodeMark = (key: string): GraphNodeMark | null => {
    if (f.cycle?.includes(key)) return { tone: 'bad', fill: 'solid' };
    if (key === f.current) return { tone: 'hi', fill: 'solid' };
    if (f.created[key] > 0) return { tone: 'ok', fill: 'tint', tint: 20 };
    return null;
  };
  const edgeMark = (e: { from: string; to: string }): GraphEdgeMark | null => {
    if (inCycle(f.cycle, e.from, e.to)) return { tone: 'bad', width: 3.5 };
    if (onPath(f.path, e.from, e.to)) return { tone: 'hi', width: 3 };
    return null;
  };
  const badge = (key: string, at: { x: number; y: number }) => {
    const reg = regs.find((r) => r.key === key)!;
    const n = f.created[key];
    return (
      <text x={at.x} y={at.y + BADGE_DY} textAnchor="middle" className="di-badge">
        <tspan className="di-badge-count">{`${key} ×${n}`}</tspan>
        {reg.lifetime === 'singleton' && n > 0 && <tspan className="di-badge-shared">{'  shared'}</tspan>}
      </text>
    );
  };

  const total = Object.values(f.created).reduce((a, b) => a + b, 0);

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Instances built so far" value={total} color="var(--hi)" />
          <Stat label="Resolves" value={`${RESOLVES} of ${root}`} sub="singletons live across both" />
          <Stat label="Outcome" value={f.cycle ? 'cycle' : player.atEnd ? 'resolved' : '…'} color={f.cycle ? 'var(--bad)' : player.atEnd ? 'var(--ok)' : 'var(--muted)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'resolving / building now (and its path)', shape: 'square' },
            { color: 'var(--ok)', label: 'built at least once', shape: 'square' },
            { color: 'var(--violet)', label: 'shared singleton', shape: 'dot' },
            { color: 'var(--bad)', label: 'dependency cycle', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <Segmented
          key="p"
          label="Registrations"
          value={preset}
          onChange={load}
          options={[
            { value: 'shop', label: 'Shop' },
            { value: 'cycle', label: 'Circular: orders ⇄ audit' },
          ]}
        />,
      ]}
    >
      <div className="di di-container stage-pad">
        <WideRegion minWidth={minWidth} label="Dependency graph: scroll sideways to see all of it">
          <GraphView
            nodes={regs.map((r) => ({ id: r.key, at: placed.at.get(r.key), shape: 'box' as const, label: r.impl }))}
            edges={edges}
            directed
            width={placed.width}
            height={placed.height}
            box={BOX}
            arrowSize={6}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            renderNode={(n, at, base) => (
              <>
                {base}
                {badge(n.id, at)}
              </>
            )}
            className="di-graph"
            ariaLabel={`Registrations: ${regs.map((r) => `${r.key} is ${r.impl}${r.deps.length ? `, needs ${r.deps.join(' and ')}` : ''}`).join('; ')}`}
          />
        </WideRegion>
        <div className="di-table-wrap" role="region" aria-label="Registrations table" tabIndex={0}>
          <table className="data-table di-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Class</th>
                <th>Needs</th>
                <th>Lifetime</th>
                <th>Built</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.key} className={r.key === f.current ? 'is-current' : ''}>
                  <td>{r.key}</td>
                  <td>{r.impl}</td>
                  <td>{r.deps.join(', ') || '–'}</td>
                  <td>
                    <Segmented
                      ariaLabel={`Lifetime of ${r.key}`}
                      value={r.lifetime}
                      onChange={(l) => setLifetimes({ ...lifetimes, [r.key]: l })}
                      options={LIFETIMES}
                    />
                  </td>
                  <td>{f.created[r.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint block>
          A toy container: register a class with what it needs and a lifetime, and it builds the graph for you. Real ones (.NET's, Spring, Dagger) add a
          third lifetime, scoped (one per request), and reflection or code generation to read constructor parameters. A container is optional: the
          composition-root scene does the same by hand.
        </Hint>
      </div>
    </StageFrame>
  );
}
