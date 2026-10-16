import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, PlotCursor, PointerLayer, Points, Segments } from '../../components/Plot2D';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { BOARD, MAX_POINTS, SQUARE_PRESET, scatterPreset } from './board';
import { hullFrames } from './frames';
import { countOrientations, type Algo, type P, type Policy } from './hull';
import { scaling, type ScalingKind } from './scaling';
import { pt } from './text';
import { useBoard } from './useBoard';

const AXIS = { domain: [0, BOARD] as [number, number], label: '', ticks: 5 };
const STEP_MS = 650;
const ALGO_LABEL: Record<Algo, string> = { graham: 'Graham scan', andrew: "Andrew's chain", jarvis: "Jarvis's march" };
const ALGO_TONE = { graham: 'amber', andrew: 'sky', jarvis: 'pink' } as const;
const segmentsOf = (path: readonly P[], close: boolean) => {
  const out = path.slice(1).map((p, i) => ({ from: [path[i].x, path[i].y] as [number, number], to: [p.x, p.y] as [number, number] }));
  if (close && path.length > 2) out.push({ from: [path[path.length - 1].x, path[path.length - 1].y], to: [path[0].x, path[0].y] });
  return out;
};

/**
 * Scenes 2 and 3: a hull algorithm stepped on points the learner places. `algos` lists the algorithms on offer (one for Graham's scene,
 * two for the chain/march scene, which also shows the orientation-test counts).
 */
export function StepScene({ picker, algos, withCounts }: { picker: ReactNode; algos: Algo[]; withCounts: boolean }) {
  const board = useBoard();
  const [xText, setXText] = useState('10');
  const [yText, setYText] = useState('10');
  const [algo, setAlgo] = useState<Algo>(algos[0]);
  const [policy, setPolicy] = useState<Policy>('drop');
  const [kind, setKind] = useState<ScalingKind>('circle');
  const run = useMemo(() => hullFrames(algo, board.points, policy), [algo, board.points, policy]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const counts = useMemo(
    () => (withCounts ? (['graham', 'andrew', 'jarvis'] as const).map((a) => ({ algo: a, tests: countOrientations(a, board.points, policy) })) : []),
    [withCounts, board.points, policy],
  );
  const rows = useMemo(() => (withCounts ? scaling(kind) : []), [withCounts, kind]);
  const otherRows = useMemo(() => (withCounts ? scaling(kind === 'circle' ? 'disc' : 'circle') : []), [withCounts, kind]);
  const otherLast = otherRows[otherRows.length - 1];
  const done = f.final !== null;
  const hullSet = new Set((f.final ?? []).map(pt));
  const stackSet = new Set(f.stack.map(pt));
  const orderIndex = new Map(f.order.map((p, i) => [pt(p), i]));
  const tone = (p: P): 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim' => {
    if (f.popped && pt(f.popped) === pt(p)) return 'bad';
    if (f.current && pt(f.current) === pt(p)) return 'hi';
    if (done) return hullSet.has(pt(p)) ? 'ok' : 'dim';
    if ((f.pivot && pt(f.pivot) === pt(p)) || (f.cur && pt(f.cur) === pt(p))) return 'violet';
    if (f.best && pt(f.best) === pt(p)) return 'info';
    if (stackSet.has(pt(p))) return 'info';
    return 'dim';
  };
  const path = done && f.final ? f.final : f.stack;
  const top = Math.max(1, ...rows.flatMap((r) => [r.graham, r.andrew, r.jarvis]));

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Orientation tests" value={f.tests} color="var(--hi)" sub={`of ${run.orientations} for this run`} />
          <Stat label={done ? 'Hull points' : 'On the stack'} value={done ? (f.final?.length ?? 0) : f.stack.length} color="var(--ok)" sub={`of ${new Set(board.points.map(pt)).size} points`} />
          <Stat label="Collinear points" value={policy === 'drop' ? 'dropped' : 'kept'} sub="the policy for points on a hull edge" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'point being tested', shape: 'dot' },
            { color: 'var(--info)', label: 'on the stack / best so far', shape: 'dot' },
            { color: 'var(--bad)', label: 'popped', shape: 'dot' },
            { color: 'var(--violet)', label: 'pivot / start', shape: 'dot' },
            { color: 'var(--ok)', label: 'hull point and edge', shape: 'dot' },
            { color: 'var(--dim)', label: 'not on the stack', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {algos.length > 1 && <Segmented label="Algorithm" value={algo} onChange={setAlgo} options={algos.map((a) => ({ value: a, label: ALGO_LABEL[a] }))} />}
          <Toggle label="Collinear points" value={policy === 'keep'} onChange={(keep) => setPolicy(keep ? 'keep' : 'drop')} off="Drop" on="Keep" />
        </>,
        <>
          <ChipButton tone="info" onClick={() => board.load(scatterPreset())}>Seeded scatter</ChipButton>
          <ChipButton tone="info" onClick={() => board.load(SQUARE_PRESET)}>Square with edge points</ChipButton>
          <TextField label="x" value={xText} onChange={setXText} onEnter={() => board.addTyped(xText, yText)} width={56} spellCheck={false} />
          <TextField label="y" value={yText} onChange={setYText} onEnter={() => board.addTyped(xText, yText)} width={56} spellCheck={false} />
          <Button onClick={() => board.addTyped(xText, yText)}>Add (x, y)</Button>
          <Button onClick={board.addAtCursor}>Add a point at the cursor</Button>
          <Button onClick={board.clear}>Clear</Button>
          <Hint>
            <span role="status">{board.note ?? `Click the plane to add a point (whole numbers, up to ${MAX_POINTS}), or move the grey cursor and press the button. Collinear points on a hull edge are ${policy === 'drop' ? 'dropped' : 'kept'}.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ch-stage stage-pad">
        <Plot2D x={AXIS} y={AXIS} aspect="equal" ariaLabel={`${ALGO_LABEL[algo]} on ${board.points.length} points`}>
          <PointerLayer onDown={board.add} />
          <Segments segments={segmentsOf(path, done)} tone={done ? 'ok' : 'info'} />
          <Points data={board.points.map((p) => ({ x: p.x, y: p.y, tone: tone(p) }))} r={4.4} labels={(i) => (algo === 'graham' && orderIndex.has(pt(board.points[i])) && !done ? String((orderIndex.get(pt(board.points[i])) ?? 0) + 1) : null)} />
          <PlotCursor at={board.cursor} onMove={board.setCursor} label="Add-point cursor" />
        </Plot2D>
        <Tray label={algo === 'jarvis' ? 'Hull so far' : `${f.chain ? `${f.chain} chain: ` : ''}the stack`} labelWeight="regular" empty="empty" ariaLabel="The stack">
          {f.stack.map((p, i) => <span key={`${pt(p)}-${i}`} className="ch-chip">{pt(p)}</span>)}
        </Tray>
        {withCounts && (
          <>
            <table className="ch-table">
              <caption>Orientation tests on these {board.points.length} points (one unit for every row: one cross-product sign; Graham's angle sort counts, Andrew's sort by x and y does not)</caption>
              <thead><tr><th scope="col">Algorithm</th><th scope="col">Tests</th></tr></thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.algo}><th scope="row">{ALGO_LABEL[c.algo]}</th><td>{c.tests}</td></tr>
                ))}
              </tbody>
            </table>
            <Segmented label="Points" value={kind} onChange={setKind} options={[{ value: 'circle', label: 'On a circle (every point on the hull)' }, { value: 'disc', label: 'In a filled disc (few on the hull)' }]} />
            <Legend items={(['graham', 'andrew', 'jarvis'] as const).map((a) => ({ color: `var(--${ALGO_TONE[a]})`, label: ALGO_LABEL[a], shape: 'line' as const }))} />
            <Plot2D x={{ domain: [rows[0].n, rows[rows.length - 1].n], label: 'points n', ticks: 5 }} y={{ domain: [0, top], label: 'orientation tests' }} ariaLabel={`Orientation tests against n for the three algorithms on points ${kind === 'circle' ? 'on a circle' : 'in a disc'}`}>
              {(['graham', 'andrew', 'jarvis'] as const).map((a) => <Curve key={a} points={rows.map((r) => [r.n, r[a]] as const)} tone={ALGO_TONE[a]} />)}
            </Plot2D>
            <p className="ch-note">
              At n = {rows[rows.length - 1].n}: h = {rows[rows.length - 1].h}, Graham {rows[rows.length - 1].graham}, Andrew {rows[rows.length - 1].andrew}, Jarvis {rows[rows.length - 1].jarvis}.
              Jarvis's work follows n x h and the sorted methods' follows n log n; measured here, Jarvis spends {(rows[rows.length - 1].jarvis / rows[rows.length - 1].andrew).toFixed(1)} times Andrew's tests on this shape and {(otherLast.jarvis / otherLast.andrew).toFixed(1)} times on the {kind === 'circle' ? 'filled disc' : 'circle'}.
            </p>
          </>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">integer coordinates, so every cross product is exact; counts come from the runs shown</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
