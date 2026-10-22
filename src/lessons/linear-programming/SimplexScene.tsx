import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, Polygon } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { WINDOW, lineEnds, regionPolygon } from './edit';
import { constraintText, objectiveText, round, vertexText, type Vertex } from './lp2d';
import { SCENE_OBJECTIVE, SCENE_REGION, START_VERTEX, edgesAt, stepCaption, walkEdge } from './simplex';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 480;
const { cx, cy } = SCENE_OBJECTIVE;
const CORNERS = regionPolygon(SCENE_REGION);

interface Walk {
  path: Vertex[];
  note: string | null;
}
const START: Walk = { path: [START_VERTEX], note: null };

/** Scene 2: walk one simplex step at a time from (0, 0): only an edge that improves the objective is allowed, as far as the nearest constraint. */
export function SimplexScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [w, setW] = useState<Walk>(START);
  const here = w.path[w.path.length - 1];
  const edges = useMemo(() => edgesAt(SCENE_REGION, cx, cy, here), [here]);
  const caption = stepCaption(here, edges, cx, cy);

  const walk = (i: number) => {
    const move = walkEdge(cx, cy, here, edges[i]);
    setW((q) => (move.ok ? { path: [...q.path, move.to], note: null } : { ...q, note: move.text }));
  };

  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="At" value={vertexText(here)} sub={`${objectiveText(cx, cy)} = ${round(here.value)}`} />
          <Stat label="Steps walked" value={w.path.length - 1} sub="each follows an improving edge" />
          <Stat label="Improving edges" value={edges.filter((e) => e.improves).length} color={edges.some((e) => e.improves) ? 'var(--hi)' : 'var(--ok)'} sub={edges.some((e) => e.improves) ? 'pick one' : 'none: optimal'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'feasible region', shape: 'square' },
            { color: 'var(--hi)', label: 'the path walked and where you stand', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setW(START)} softDisabled={w.path.length === 1}>Back to (0, 0)</Button>
        </>,
      ]}
    >
      <div className="stage-pad lp-stage">
        <Plot2D
          x={{ domain: [0, WINDOW], ticks: 5 }}
          y={{ domain: [0, WINDOW], ticks: 5 }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          aspect="equal"
          ariaLabel={`Feasible region with the walk at ${vertexText(here)}, worth ${round(here.value)}`}
        >
          <Polygon points={CORNERS} tone="info" />
          {SCENE_REGION.map((k) => (
            <Curve key={constraintText(k)} points={lineEnds(k)} tone="muted" dashed />
          ))}
          <Curve points={w.path.map((v): [number, number] => [v.x, v.y])} tone="hi" width={3} />
          <Points data={[{ x: here.x, y: here.y, tone: 'hi' as Tone }]} r={8} />
        </Plot2D>
        <div role="status" className="lp-note">
          {w.note ? <Hint tone="bad" block>{w.note}</Hint> : <Hint block>Region: {SCENE_REGION.map(constraintText).join(', ')}, x &gt;= 0, y &gt;= 0. Objective: maximise {objectiveText(cx, cy)}.</Hint>}
        </div>
        <table className="data-table lp-table">
          <thead>
            <tr><th>Edge to</th><th>Objective change</th><th>Ratio test: where each constraint is met</th><th /></tr>
          </thead>
          <tbody>
            {edges.map((e, i) => (
              <tr key={i}>
                <td>{vertexText(e.to)}</td>
                <td className={e.improves ? 'is-up' : 'is-down'}>{e.change > 0 ? '+' : ''}{round(e.change)} ({e.improves ? 'improves' : 'does not improve'})</td>
                <td>{e.ratio.map((r) => `${r.constraint} at ${round(r.at)}`).join('; ')}; nearest {round(e.step)}</td>
                <td><Button onClick={() => walk(i)}>Walk to {vertexText(e.to)}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <ClaimLabel kind="theorem">with no improving edge the vertex is optimal, because a linear objective over a convex region has no other kind of peak</ClaimLabel>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">one geometric step of simplex on two variables: no tableau, which is named and not built</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
