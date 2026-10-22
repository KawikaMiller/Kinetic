import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points, Polygon } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { WINDOW, regionPolygon } from './edit';
import { DEFAULT_CONSTRAINTS, integerSolution, integerText, objectiveText, round, roundedPoint, solve, vertexText } from './lp2d';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 480;
/** The whole-number scene keeps its own copy of the default region and the objective x + 2y. */
const [CX, CY] = [1, 2];
const CORNERS = regionPolygon(DEFAULT_CONSTRAINTS);

/** Scene 3: the same region with whole numbers required: the LP optimum, its rounding, and the best whole points. */
export function IntegerScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [whole, setWhole] = useState(false);
  const lp = useMemo(() => solve(DEFAULT_CONSTRAINTS, CX, CY), []);
  const ints = useMemo(() => integerSolution(DEFAULT_CONSTRAINTS, CX, CY), []);
  const rounded = roundedPoint(lp.best[0]);
  const caption = integerText(DEFAULT_CONSTRAINTS, lp, ints);
  const isBest = (x: number, y: number) => ints.best.some((p) => p.x === x && p.y === y);

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="LP optimum" value={round(lp.value!)} sub={`at ${vertexText(lp.best[0])}, fractions allowed`} />
          <Stat label="Whole-number optimum" value={round(ints.value!)} color="var(--ok)" sub={`at ${ints.best.map(vertexText).join(' and ')}`} />
          <Stat label="Rounded LP point" value={vertexText(rounded)} color="var(--bad)" sub="outside the region" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'feasible region', shape: 'square' },
            { color: 'var(--ok)', label: 'optimal point (LP, or whole-number best)', shape: 'dot' },
            { color: 'var(--bad)', label: 'the rounded point: not allowed', shape: 'dot' },
            { color: 'var(--muted)', label: 'whole points inside the region', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Variables must be" value={whole} off="any number" on="whole numbers" onChange={setWhole} />
        </>,
      ]}
    >
      <div className="stage-pad lp-stage">
        <Plot2D
          x={{ domain: [0, WINDOW], ticks: 5 }}
          y={{ domain: [0, WINDOW], ticks: 5 }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          aspect="equal"
          ariaLabel={`Feasible region for ${objectiveText(CX, CY)} with the ${whole ? 'whole points and the best of them' : 'LP optimum and its rounding'} marked`}
        >
          <Polygon points={CORNERS} tone="info" />
          {whole ? (
            <Points data={ints.points.map((p) => ({ x: p.x, y: p.y, tone: (isBest(p.x, p.y) ? 'ok' : 'muted') as Tone, r: isBest(p.x, p.y) ? 7 : 4 }))} />
          ) : (
            <Points data={lp.best.map((v) => ({ x: v.x, y: v.y, tone: 'ok' as Tone }))} r={7} />
          )}
          <Points data={[{ x: rounded.x, y: rounded.y, tone: 'bad' as Tone, hollow: true }]} r={7} />
        </Plot2D>
        <Hint block>Region: x + y &lt;= 4, x + 3y &lt;= 7, x &lt;= 3, x &gt;= 0, y &gt;= 0. Objective: maximise {objectiveText(CX, CY)}. Requiring whole numbers is a different problem (integer programming), named here and not solved by this lesson.</Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">two variables and one fixed region, so the whole points can be listed</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
