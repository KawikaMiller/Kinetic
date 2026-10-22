import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, Polygon } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { refocusAfterRemove } from '../../core/refocus';
import type { Tone } from '../../core/tone';
import { WINDOW, addRow, changeRow, constraintsOf, draggedBound, handlePoint, initialRows, lineEnds, objectiveEnds, regionPolygon, type Row } from './edit';
import {
  DEFAULT_OBJECTIVE, LIMITS, NO_AXES_WITNESS, SOLVER_OPTIONS, brokenRule, constraintText, objectiveText, round, solutionText, solve, vertexText,
  type Constraint, type SolverMode,
} from './lp2d';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 480;
const OBJECTIVE_PRESETS: readonly { label: string; cx: number; cy: number }[] = [
  { label: '3x + 2y (the default)', cx: 3, cy: 2 },
  { label: 'x + 2y', cx: 1, cy: 2 },
  { label: 'x + y (a tie)', cx: 1, cy: 1 },
];
const SOLVERS = [
  { value: 'correct' as SolverMode, label: 'Correct' },
  { value: 'no-axes' as SolverMode, label: 'Forgets x, y >= 0' },
  { value: 'no-feasibility' as SolverMode, label: 'Skips the feasibility check' },
];
const LINE_TONES: readonly Tone[] = ['sky', 'amber', 'pink', 'orange', 'violet', 'muted'];

interface Setup {
  rows: Row[];
  cx: number;
  cy: number;
  editing: number;
  mode: SolverMode;
  note: string | null;
}
const START: Setup = { rows: initialRows(), cx: DEFAULT_OBJECTIVE.cx, cy: DEFAULT_OBJECTIVE.cy, editing: 0, mode: 'correct', note: null };

/** Scene 1: drag and edit the constraints, turn the objective, and read the feasible region, its vertices and the verdict. */
export function RegionScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [s, setS] = useState<Setup>(START);
  const cons = useMemo(() => constraintsOf(s.rows), [s.rows]);
  const right = useMemo(() => solve(cons, s.cx, s.cy), [cons, s.cx, s.cy]);
  const shown = useMemo(() => solve(cons, s.cx, s.cy, SOLVER_OPTIONS[s.mode]), [cons, s.cx, s.cy, s.mode]);
  const rule = brokenRule(cons, s.cx, s.cy, s.mode);
  const corners = useMemo(() => regionPolygon(cons), [cons]);
  const caption = s.mode === 'correct'
    ? solutionText(cons, right)
    : `The ${s.mode === 'no-axes' ? 'solver that forgets x, y >= 0' : 'solver that skips the feasibility check'} says ${shown.status === 'optimal' ? `${round(shown.value!)} at ${vertexText(shown.best[0])}` : shown.status}. ${rule ? `It breaks the rule "${rule}": the correct answer is ${right.status === 'optimal' ? `${round(right.value!)} at ${vertexText(right.best[0])}` : right.status}.` : 'Here it happens to agree with the correct answer.'}`;
  const level = shown.status === 'optimal' ? shown.value! : null;
  const ends = level === null ? null : objectiveEnds(s.cx, s.cy, level);

  const change = (i: number, patch: Partial<Constraint>) => {
    const r = changeRow(s.rows, i, patch);
    setS((q) => (r.ok ? { ...q, rows: r.rows, note: null } : { ...q, note: `${r.text}. The row is unchanged.` }));
  };
  const add = () => {
    const r = addRow(s.rows);
    setS((q) => (r.ok ? { ...q, rows: r.rows, editing: r.rows.length - 1, note: null } : { ...q, note: `${r.text}.` }));
  };
  const remove = (i: number) => setS((q) => ({ ...q, rows: q.rows.filter((_, k) => k !== i), editing: Math.max(0, Math.min(q.editing, q.rows.length - 2)), note: null }));

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Verdict" value={shown.status} color={shown.status === 'optimal' ? 'var(--ok)' : 'var(--bad)'} sub={s.mode === 'correct' ? 'by trying every vertex' : 'from the solver you picked'} />
          <Stat label="Best value" value={shown.value === null ? 'none' : shown.status === 'unbounded' ? `${round(shown.value)} (wall)` : round(shown.value)} sub={objectiveText(s.cx, s.cy)} />
          <Stat label="Vertices" value={shown.vertices.length} sub="corners of the region" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'feasible region', shape: 'square' },
            { color: 'var(--hi)', label: 'objective line at its best level', shape: 'line' },
            { color: 'var(--ok)', label: 'optimal vertex', shape: 'dot' },
            { color: 'var(--muted)', label: 'handles: drag a constraint line', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Solver" options={SOLVERS} value={s.mode} onChange={(mode) => setS((q) => ({ ...q, mode }))} />
        </>,
        <>
          <Slider label="Objective cx" value={s.cx} min={LIMITS.objective.min} max={LIMITS.objective.max} step={LIMITS.objective.step} onChange={(cx) => setS((q) => ({ ...q, cx, note: null }))} />
          <Slider label="Objective cy" value={s.cy} min={LIMITS.objective.min} max={LIMITS.objective.max} step={LIMITS.objective.step} onChange={(cy) => setS((q) => ({ ...q, cy, note: null }))} />
          <ControlGroup label="Objective presets">
            {OBJECTIVE_PRESETS.map((p) => (
              <ChipButton key={p.label} on={s.cx === p.cx && s.cy === p.cy} onClick={() => setS((q) => ({ ...q, cx: p.cx, cy: p.cy, note: null }))}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button className="lp-add" onClick={add}>Add a constraint</Button>
          <Button onClick={() => setS(START)}>Reset the region</Button>
          {s.mode === 'no-axes' && (
            <Button onClick={() => setS((q) => ({ ...q, rows: initialRows(), cx: NO_AXES_WITNESS.cx, cy: NO_AXES_WITNESS.cy, note: null }))}>Load the witness: minimise y</Button>
          )}
        </>,
      ]}
    >
      <div className="stage-pad lp-stage">
        <Plot2D
          x={{ domain: [0, WINDOW], ticks: 5 }}
          y={{ domain: [0, WINDOW], ticks: 5 }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          aspect="equal"
          ariaLabel={`Feasible region of ${s.rows.length} constraints with the objective ${objectiveText(s.cx, s.cy)}: ${shown.status}`}
        >
          {corners.length >= 3 && <Polygon points={corners} tone="info" />}
          {s.rows.map((r, i) => (
            <Curve key={r.id} points={lineEnds(r)} tone={LINE_TONES[i % LINE_TONES.length]} />
          ))}
          {ends && <Curve points={ends} tone="hi" width={3} />}
          <Points
            data={shown.status === 'unbounded' ? [] : shown.best.filter((v) => v.x <= WINDOW && v.y <= WINDOW).map((v) => ({ x: v.x, y: v.y, tone: 'ok' as Tone }))}
            r={7}
          />
          <Points
            data={s.rows.map((r, i) => {
              const [x, y] = handlePoint(r);
              return { x, y, tone: LINE_TONES[i % LINE_TONES.length], hollow: true };
            })}
            r={6}
            labels={(i) => String(i + 1)}
            pointLabel={(i) => `Handle of constraint ${i + 1}: ${constraintText(s.rows[i])}`}
            onDrag={(i, [x, y]) => change(i, { c: draggedBound(s.rows[i], x, y) })}
          />
        </Plot2D>
        <div role="status" className="lp-note">
          {s.note ? <Hint tone="bad" block>{s.note}</Hint> : <Hint block>The plot shows x and y from 0 to {WINDOW}; the region also needs x &gt;= 0 and y &gt;= 0.</Hint>}
        </div>
        <ol className="lp-cards" aria-label="Constraints">
          {s.rows.map((r, i) => (
            <li key={r.id} className={`lp-card ${s.editing === i ? 'is-open' : ''}`}>
              <div className="lp-card-head">
                <span className={`lp-swatch tone-${LINE_TONES[i % LINE_TONES.length]}`} aria-hidden="true" />
                <code>{i + 1}. {constraintText(r)}</code>
                <Button softDisabled={s.editing === i} onClick={() => setS((q) => ({ ...q, editing: i }))}>Edit</Button>
                <Button className="lp-remove" onClick={(e) => { refocusAfterRemove(e.currentTarget, { group: '.lp-cards', items: '.lp-remove', fallback: '.lp-add' }); remove(i); }} softDisabled={s.rows.length <= 1}>Remove</Button>
              </div>
              {s.editing === i && (
                <div className="lp-card-sliders">
                  <Slider label="a" value={r.a} min={LIMITS.coefficient.min} max={LIMITS.coefficient.max} step={LIMITS.coefficient.step} onChange={(a) => change(i, { a })} />
                  <Slider label="b" value={r.b} min={LIMITS.coefficient.min} max={LIMITS.coefficient.max} step={LIMITS.coefficient.step} onChange={(b) => change(i, { b })} />
                  <Slider label="c" value={r.c} min={LIMITS.bound.min} max={LIMITS.bound.max} step={LIMITS.bound.step} onChange={(c) => change(i, { c })} />
                </div>
              )}
            </li>
          ))}
        </ol>
        <table className="data-table lp-table">
          <thead>
            <tr><th>Vertex</th><th>{objectiveText(s.cx, s.cy)}</th></tr>
          </thead>
          <tbody>
            {shown.vertices.length === 0 ? (
              <tr><td colSpan={2}>no vertex: nothing is feasible</td></tr>
            ) : (
              shown.vertices.map((v) => (
                <tr key={`${v.x},${v.y}`} className={shown.best.some((b) => b.x === v.x && b.y === v.y) ? 'is-best' : undefined}>
                  <td>{vertexText(v)}</td>
                  <td>{round(v.value)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {s.mode === 'no-axes' && (
          <Hint tone="muted" block>
            Shortest witness: the default region with the objective minimise y (cx = {NO_AXES_WITNESS.cx}, cy = {NO_AXES_WITNESS.cy}). The correct answer is optimal, value {NO_AXES_WITNESS.correct}, tied along the bottom edge; the solver without x, y &gt;= 0 says unbounded, because y can run to minus 1,000.
          </Hint>
        )}
        <div className="lp-claims">
          <ClaimLabel kind="theorem">a linear objective over a bounded convex polygon reaches its best value at a vertex (argued; checked on 200 seeded LPs when the lesson was built)</ClaimLabel>
          <ClaimLabel kind="theorem">Helly: in the plane, an infeasible system always holds a clash of at most 3 constraints</ClaimLabel>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">two variables, at most six constraints: real models have thousands and are solved by simplex or interior-point codes</Provenance>
        <Provenance kind="not-run">the 200-LP check of the vertex theorem is part of the lesson's tests and is not run on this page</Provenance>
        <Provenance kind="from-memory">simplex can take exponentially many steps on contrived inputs (Klee and Minty, 1972) yet is fast in practice; interior-point methods are polynomial (Karmarkar, 1984). Verify against Dantzig (1947), Klee and Minty (1972) and Karmarkar (1984).</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
