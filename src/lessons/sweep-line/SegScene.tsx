import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Tray } from '../../components/Panel';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import type { DragSource } from '../../core/plot';
import { usePlayer } from '../../core/usePlayer';
import { segFrames } from './frames';
import { GRID, MAX_SEGMENTS, SEG_OPEN, SEG_PRESETS, snapCell, type SegSet } from './presets';
import { scaleNote } from './scale';

const AXIS = { domain: [0, GRID] as [number, number], label: '', ticks: 6 };
const STEP_MS = 800;

/** Scene 3: crossings of horizontal and vertical segments by a left-to-right sweep over a sorted active set. */
export function SegScene({ picker }: { picker: ReactNode }) {
  const [set, setSet] = useState<SegSet>(SEG_OPEN);
  const [note, setNote] = useState<string | null>(null);
  const run = useMemo(() => segFrames(set.hs, set.vs), [set]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const scale = useMemo(() => scaleNote(), []);
  const intersections = f.found.map((c) => ({ x: set.vs[c.v].x, y: set.hs[c.h].y }));

  const setH = (i: number, k: 0 | 1, [px, py]: readonly [number, number], via?: DragSource) => {
    const h = set.hs[i];
    const x = snapCell(k === 0 ? h.x0 : h.x1, px, via);
    const [x0, x1] = k === 0 ? [x, h.x1] : [h.x0, x];
    setSet({ ...set, hs: set.hs.map((s, n) => (n === i ? { y: snapCell(h.y, py, via), x0: Math.min(x0, x1), x1: Math.max(x0, x1) } : s)) });
    setNote(null);
  };
  const setV = (i: number, k: 0 | 1, [px, py]: readonly [number, number], via?: DragSource) => {
    const v = set.vs[i];
    const y = snapCell(k === 0 ? v.y0 : v.y1, py, via);
    const [y0, y1] = k === 0 ? [y, v.y1] : [v.y0, y];
    setSet({ ...set, vs: set.vs.map((s, n) => (n === i ? { x: snapCell(v.x, px, via), y0: Math.min(y0, y1), y1: Math.max(y0, y1) } : s)) });
    setNote(null);
  };
  const addH = () => {
    if (set.hs.length >= MAX_SEGMENTS) return setNote(`The grid keeps up to ${MAX_SEGMENTS} horizontal segments.`);
    setSet({ ...set, hs: [...set.hs, { y: 6, x0: 2, x1: 9 }] });
  };
  const addV = () => {
    if (set.vs.length >= MAX_SEGMENTS) return setNote(`The grid keeps up to ${MAX_SEGMENTS} vertical segments.`);
    setSet({ ...set, vs: [...set.vs, { x: 6, y0: 2, y1: 9 }] });
  };

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Crossings found" value={f.found.length} color="var(--ok)" sub={`${run.crossings.length} when finished`} />
          <Stat label="Sweep comparisons" value={run.sweepComparisons} color="var(--info)" sub="events sorted plus every y comparison" />
          <Stat label="Every pair checked" value={run.brute.comparisons} color="var(--bad)" sub={`${set.hs.length} x ${set.vs.length} = ${run.brute.pairs} pairs`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'horizontal segment in the active set', shape: 'line' },
            { color: 'var(--dim)', label: 'horizontal not active / vertical', shape: 'line' },
            { color: 'var(--hi)', label: 'sweep line / vertical being queried', shape: 'line' },
            { color: 'var(--ok)', label: 'crossing found', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {SEG_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={set === p.set} onClick={() => { setSet(p.set); setNote(null); }}>{p.label}</ChipButton>
          ))}
          <Button onClick={addH}>Add horizontal</Button>
          <Button onClick={addV}>Add vertical</Button>
          <Button onClick={() => set.hs.length > 1 && setSet({ ...set, hs: set.hs.slice(0, -1) })}>Remove last horizontal</Button>
          <Button onClick={() => set.vs.length > 1 && setSet({ ...set, vs: set.vs.slice(0, -1) })}>Remove last vertical</Button>
          <Hint>
            <span role="status">{note ?? `Drag an end (it snaps to the grid, and the segment stays horizontal or vertical), or use the arrow keys (one grid step per press). Up to ${MAX_SEGMENTS} of each kind.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Plot2D x={AXIS} y={AXIS} aspect="equal" ariaLabel={`${set.hs.length} horizontal and ${set.vs.length} vertical segments with a sweep line`}>
          <Segments segments={set.hs.map((h, i) => ({ from: [h.x0, h.y] as [number, number], to: [h.x1, h.y] as [number, number], tone: f.active.includes(i) ? ('info' as const) : ('dim' as const) }))} />
          <Segments segments={set.vs.map((v, i) => ({ from: [v.x, v.y0] as [number, number], to: [v.x, v.y1] as [number, number], tone: f.v === i ? ('hi' as const) : ('dim' as const) }))} />
          {f.x !== null && <VLine at={f.x} label={`x = ${f.x}`} tone="hi" dashed={false} />}
          <Points data={intersections.map((p) => ({ x: p.x, y: p.y, tone: 'ok' as const, r: 5 }))} />
          <Points
            data={set.hs.flatMap((h) => [{ x: h.x0, y: h.y, tone: 'muted' as const, r: 3.4 }, { x: h.x1, y: h.y, tone: 'muted' as const, r: 3.4 }])}
            onDrag={(k, p, via) => setH(k >> 1, (k % 2) as 0 | 1, p, via)}
            pointLabel={(k) => `${k % 2 === 0 ? 'Left' : 'Right'} end of horizontal ${(k >> 1) + 1}`}
            roving
          />
          <Points
            data={set.vs.flatMap((v) => [{ x: v.x, y: v.y0, tone: 'muted' as const, r: 3.4 }, { x: v.x, y: v.y1, tone: 'muted' as const, r: 3.4 }])}
            onDrag={(k, p, via) => setV(k >> 1, (k % 2) as 0 | 1, p, via)}
            pointLabel={(k) => `${k % 2 === 0 ? 'Lower' : 'Upper'} end of vertical ${(k >> 1) + 1}`}
            roving
          />
        </Plot2D>
        <Tray label="Active set (sorted by y)" labelWeight="regular" empty="empty" ariaLabel="Active set">
          {f.active.map((h) => <span key={h} className="sw-event">horizontal {h + 1}: y = {set.hs[h].y}</span>)}
        </Tray>
        <p className="sw-note">
          Counts use one unit: a key comparison. The sweep counts one for each step of its sort and its search of the active set (each compares a coordinate and, on a tie, an id), while checking every pair counts each coordinate comparison on its own, up to four per pair, so the unit is not exactly the same and the sweep's saving is shown a little larger than it is. On your {set.hs.length} by {set.vs.length} segments the sweep makes {run.sweepComparisons} against {run.brute.comparisons} for checking every pair, so it {run.sweepComparisons < run.brute.comparisons ? 'already wins' : 'does not win yet: it pays for sorting the events'}. At {scale.n} horizontal and {scale.n} vertical segments (a seeded sparse input with only {scale.crossings} crossings, model only, not drawn) it makes {scale.sweep.toLocaleString('en-US')} against {scale.brute.toLocaleString('en-US')} for {scale.pairs.toLocaleString('en-US')} pairs.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every count is computed from the segments as drawn</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
