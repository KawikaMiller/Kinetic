import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal, plural } from '../../core/format';
import { STORE_NAMES, workloadCaption } from './captions';
import { CONTENTION_TICKS, COST_PER_TICK, runContention } from './contention';
import { BEST, costOf } from './facts';
import { initialWorkloadScene } from './init';
import { COLUMN_COUNT, MIX, ROW_COUNT, SEEK_VALUES, mixCost, samePlacement, type Store } from './workload';

const STORE_OPTIONS: { value: Store; label: string }[] = [
  { value: 'row', label: 'Row store' },
  { value: 'column', label: 'Column store' },
];
const STORE_TONE: Record<Store, string> = { row: 'info', column: 'violet' };
const SPARK_W = 320;
const SPARK_H = 48;

export function WorkloadScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialWorkloadScene);
  const { placement, seed } = state;

  const mix = useMemo(() => mixCost(MIX, placement), [placement]);
  const queue = useMemo(() => runContention(placement, seed), [placement, seed]);
  const bestCost = costOf(BEST);
  const isBest = samePlacement(placement, BEST);

  useIntroCaption(workloadCaption(placement, mix, BEST, bestCost, queue), [placement, seed]);

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Mix cost" value={mix.cost.toLocaleString('en-US')} color={isBest ? 'var(--ok)' : 'var(--bad)'} sub={[`${mix.values.toLocaleString('en-US')} values read`, `${mix.places} places visited`]} />
          <Stat label="Best placement" value={bestCost.toLocaleString('en-US')} color="var(--ok)" sub={`points on the ${STORE_NAMES[BEST.points]}, scans on the ${STORE_NAMES[BEST.scans]}`} />
          <Stat label="Point wait" value={queue.shared ? `${queue.maxPointWait} ticks` : 'none'} color={queue.maxPointWait >= 1 ? 'var(--bad)' : undefined} sub={queue.shared ? `longest, behind a scan; mean ${decimal(queue.meanPointWait, 1)}` : 'separate stores'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'row store (operational: whole rows together)', shape: 'square' },
            { color: 'var(--violet)', label: 'column store (analytical: each column together)', shape: 'square' },
            { color: 'var(--ok)', label: 'the cheapest placement; red is a dearer one', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Point reads and writes go to" value={placement.points} onChange={(s) => setState((st) => ({ ...st, placement: { ...st.placement, points: s } }))} options={STORE_OPTIONS} />
          <Segmented label="Scans go to" value={placement.scans} onChange={(s) => setState((st) => ({ ...st, placement: { ...st.placement, scans: s } }))} options={STORE_OPTIONS} />
        </>,
        <>
          <SeedField seed={seed} onSeed={(s) => setState((st) => ({ ...st, seed: s }))} />
        </>,
      ]}
    >
      <div className="wl-stage stage-pad">
        <Box>
          <SectionTitle hint={`${ROW_COUNT.toLocaleString('en-US')} rows of ${COLUMN_COUNT} columns; cost = values read + ${SEEK_VALUES} for each separate place visited`}>The five operations</SectionTitle>
          <div className="wl-scroll" role="region" aria-label="The five operations and what each costs on its store" tabIndex={0}>
            <table className="data-table wl-table">
              <thead>
                <tr><th scope="col">Operation</th><th scope="col">Store</th><th scope="col">Values</th><th scope="col">Places</th><th scope="col">Cost</th></tr>
              </thead>
              <tbody>
                {mix.perOp.map(({ op, store, cost }) => (
                  <tr key={op.id}>
                    <th scope="row">{op.label}{op.kind === 'scan' ? ` (${op.columns} columns)` : ''}</th>
                    <td><span className={`wl-tag tone-${STORE_TONE[store]}`}>{STORE_NAMES[store]}</span></td>
                    <td>{cost.values.toLocaleString('en-US')}</td>
                    <td>{cost.places}</td>
                    <td>{cost.cost.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`${CONTENTION_TICKS} ticks, a store works through ${COST_PER_TICK} cost a tick, one operation at a time`}>Point operations waiting</SectionTitle>
          <Sparkline values={queue.queue} cap={queue.queue.length} minMax={1} align="left" pad={{ top: 3, bottom: 3 }} width={SPARK_W} height={SPARK_H} color={queue.shared ? 'var(--bad)' : 'var(--ok)'} />
          <p className="wl-note">
            {queue.shared
              ? `One store serves both: a scan holds it, so up to ${queue.queue.reduce((m, v) => Math.max(m, v), 0)} point operations queued at once. ${plural(queue.pointsServed, 'point operation')} and ${plural(queue.scansServed, 'scan')} served.`
              : `Separate stores: point operations were served as they arrived (${plural(queue.pointsServed, 'one')}), and the ${plural(queue.scansServed, 'scan')} ran on the other store.`}
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a simpler cost model than the columnar lesson&rsquo;s pages, sharing no code with it: values read, plus {SEEK_VALUES} for each separate place visited</Provenance>
          <Provenance kind="simulated" seed={seed}>arrivals and scans are seeded; how long a store takes is cost divided by {COST_PER_TICK}, not a measurement</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
