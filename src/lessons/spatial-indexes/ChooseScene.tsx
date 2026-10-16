import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { COMPARE_K, COMPARE_QUERIES, COMPARE_RANGE_SIDE, compareStructures } from './compare';
import { DEFAULT_N, DEFAULT_SEED, makePoints } from './data';
import { HD_MAX_DIM, HD_MIN_DIM, HD_POINTS, HD_QUERIES, dimensionCurve } from './highDim';
import { QUAD_CAPACITY, openingState } from './opening';
import { avg, pct } from './text';

const OPEN = openingState().choose;

const NOTES: Record<string, string> = {
  scan: 'Nothing to build or keep in step; every query pays for every point.',
  kd: 'Balanced by construction; adding points later unbalances it, so it is rebuilt or rebalanced.',
  quad: 'An insert only touches one cell, so updates are easy; depth follows the data, so clusters make it deep.',
};

/** Scene 5: the three methods on one data set, and where trees stop pruning as dimensions grow. */
export function ChooseScene({ picker }: { picker: ReactNode }) {
  const [dims, setDims] = useState(OPEN.dims);
  const rows = useMemo(() => compareStructures(makePoints(DEFAULT_SEED, DEFAULT_N), QUAD_CAPACITY), []);
  const curve = useMemo(() => dimensionCurve(), []);
  const here = curve.find((r) => r.dims === dims) ?? curve[0];

  return (
    <StageFrame
      height={420}
      intro={
        <>
          On the same {DEFAULT_N} points a nearest-{COMPARE_K} search distance-checks {avg(rows[1].nnChecks)} points on average with the k-d tree and {avg(rows[2].nnChecks)} with the quadtree, against {DEFAULT_N} for a scan.
          In {dims} dimensions a k-d tree nearest-neighbour search visits {pct(here.fraction)} of its nodes.
        </>
      }
      introKey={[dims, rows]}
      stats={
        <Stats>
          <Stat label="Nodes visited" value={pct(here.fraction)} color="var(--info)" sub={`k-d tree, ${dims} dimensions, ${HD_POINTS.toLocaleString('en-US')} uniform points`} />
          <Stat label={`At ${HD_MIN_DIM} dimensions`} value={pct(curve[0].fraction)} sub="measured on the same points" />
          <Stat label={`At ${HD_MAX_DIM} dimensions`} value={pct(curve[curve.length - 1].fraction)} color="var(--bad)" sub="measured on the same points" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'share of nodes a k-d nearest search visited', shape: 'line' }, { color: 'var(--hi)', label: 'the dimension you picked', shape: 'dot' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Dimensions d" value={dims} min={HD_MIN_DIM} max={HD_MAX_DIM} onChange={setDims} />
        </>,
      ]}
    >
      <div className="si-stage stage-pad">
        <table className="si-table">
          <caption>
            One data set ({DEFAULT_N} points, seed {DEFAULT_SEED}), {COMPARE_QUERIES} seeded queries: nearest {COMPARE_K} and a {COMPARE_RANGE_SIDE} by {COMPARE_RANGE_SIDE} rectangle. Build cost counts coordinate comparisons; queries count nodes visited and points distance-checked, averaged per query.
          </caption>
          <thead>
            <tr>
              <th scope="col">Structure</th>
              <th scope="col">Build (comparisons)</th>
              <th scope="col">Nearest: nodes / checks</th>
              <th scope="col">Range: nodes / checks</th>
              <th scope="col">Index nodes</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" data-label="Structure">{r.label}</th>
                <td data-label="Build (comparisons)">{r.build.toLocaleString('en-US')}</td>
                <td data-label="Nearest: nodes / checks">{r.id === 'scan' ? `none / ${r.nnChecks}` : `${avg(r.nnNodes)} / ${avg(r.nnChecks)}`}</td>
                <td data-label="Range: nodes / checks">{r.id === 'scan' ? `none / ${r.rangeChecks}` : `${avg(r.rangeNodes)} / ${avg(r.rangeChecks)}`}</td>
                <td data-label="Index nodes">{r.memory}</td>
                <td data-label="Notes">{NOTES[r.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="si-note">Geohash is left out of the table: it names a cell, so it answers "which cell" and a prefix range scan, not an exact nearest neighbour.</p>
        <Plot2D
          x={{ domain: [HD_MIN_DIM, HD_MAX_DIM], label: 'dimensions d', ticks: 8 }}
          y={{ domain: [0, 1], label: 'nodes visited', format: (v) => `${Math.round(v * 100)}%` }}
          ariaLabel="Share of k-d tree nodes visited by a nearest-neighbour search against the number of dimensions"
        >
          <Curve points={curve.map((r) => [r.dims, r.fraction] as const)} tone="info" />
          <VLine at={dims} />
          <Points data={[{ x: here.dims, y: here.fraction, tone: 'hi', r: 5 }]} />
        </Plot2D>
        <p className="si-note">
          {HD_QUERIES} queries per dimension on {HD_POINTS.toLocaleString('en-US')} uniform random points, each run for real. The 1-nearest search is exact, so a high share means the tree stopped helping, not that it went wrong.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={DEFAULT_SEED}>made-up points; counts are measured from real runs</Provenance>
        <Provenance kind="from-memory">which databases and engines use which spatial index (R-trees for spatial columns, for example) is named, not shown: verify before relying on it</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
