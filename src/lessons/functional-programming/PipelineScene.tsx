import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { SPRING } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { pipelineFrames, type CardView } from './frames';
import { CHAIN_CODE, FIRST_STATION_LINE, LOOP_CODE, ORDERS, STATION_CALLS, STATIONS, type Order, type Plan } from './model';

const STEP_MS = 850;
/** Left edge of each column: the input array, after station 1, after station 2, the reduce bin. */
const COL_X = [0, 224, 448, 672] as const;
const CARD_W = 172;
/** The gate line sits in the middle of the gap between two columns. */
const GATE_OFFSET = (COL_X[1] - CARD_W) / 2 - 1;
const HEADER_H = 46;
const ROW_H = 38;
/** The bin's big total sits above the cards that dropped into it. */
const BIN_HEAD = 44;
const BIN_PAD = 6;
const BIN_COL = 3;
const BELT_W = COL_X[3] + CARD_W;
const BELT_H = HEADER_H + BIN_HEAD + ORDERS.length * ROW_H + 8;

const PLANS = [
  { value: 'map-first' as const, label: 'Map first' },
  { value: 'filter-first' as const, label: 'Filter first' },
];

export function PipelineScene({ picker }: { picker: ReactNode }) {
  const [plan, setPlan] = useState<Plan>('map-first');
  const frames = useMemo(() => pipelineFrames(ORDERS, plan), [plan]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const stations = STATIONS[plan];
  const total = f.calls.map + f.calls.filter + f.calls.reduce;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="map calls" value={<AnimatedValue value={f.calls.map} />} />
          <Stat label="filter calls" value={<AnimatedValue value={f.calls.filter} />} />
          <Stat label="reduce calls" value={<AnimatedValue value={f.calls.reduce} />} />
          <Stat label="total calls" value={<AnimatedValue value={total} />} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being processed' },
            { color: 'var(--ok)', label: 'kept' },
            { color: 'var(--dim)', label: 'filtered out' },
            { color: 'var(--violet)', label: 'accumulator' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Order of stations" value={plan} onChange={setPlan} options={PLANS} />
        </>,
      ]}
    >
      <div className="fp stage-pad">
        <WideRegion minWidth={BELT_W} label="Pipeline: scroll sideways to see every station">
          <div className="fp-belt" style={{ width: BELT_W, height: BELT_H }}>
            <div className="fp-col-head" style={{ left: COL_X[0] }}>
              <code>orders</code>
              <span>the input array</span>
            </div>
            {stations.map((kind, s) => (
              <div key={`${plan}-${kind}`}>
                <div className={`fp-gate ${f.station === s ? 'is-on' : ''}`} style={{ left: COL_X[s] + CARD_W + GATE_OFFSET }}>
                  <AnimatedValue value={f.calls[kind]} className="fp-gate-count" />
                </div>
                <div className={`fp-col-head ${f.station === s ? 'is-on' : ''}`} style={{ left: COL_X[s + 1] }}>
                  <code>{STATION_CALLS[kind]}</code>
                  <span>{kind === 'reduce' ? 'one value' : 'returns a new array'}</span>
                </div>
              </div>
            ))}
            <div className={`fp-bin ${f.acc !== null ? 'is-on' : ''}`} style={{ left: COL_X[3], top: HEADER_H - BIN_PAD, width: CARD_W, height: BELT_H - HEADER_H + BIN_PAD }}>
              <span className="fp-bin-label">revenue</span>
              <AnimatedValue value={f.acc === null ? '$0' : `$${f.acc}`} className="fp-bin-value" />
            </div>
            {ORDERS.map((o, row) => (
              <Card key={o.id} view={f.cards[o.id]} row={row} order={o} />
            ))}
          </div>
        </WideRegion>
        <div className="fp-code">
          <CodePanel
            title="The chain"
            lines={CHAIN_CODE[plan]}
            active={f.station === null ? null : f.station + FIRST_STATION_LINE}
          />
          <CodePanel title="The same job as a loop" lines={LOOP_CODE} />
        </div>
        <p className="fp-note">
          Each method runs over the whole array and returns a new one before the next starts. A loop does it in one
          pass, but mixes pricing, filtering and summing into one body.
        </p>
      </div>
    </StageFrame>
  );
}

/** An order card: its raw quantity and price until map prices it, then its total. */
function Card({ view, row, order: o }: { view: CardView; row: number; order: Order }) {
  return (
    <motion.div
      className={`fp-card is-${view.status}`}
      style={{ width: CARD_W }}
      initial={false}
      animate={{ x: COL_X[view.col], y: HEADER_H + (view.col === BIN_COL ? BIN_HEAD : 0) + row * ROW_H }}
      transition={SPRING.snappy}
    >
      <span className="fp-card-label">{o.item}</span>
      {view.total === undefined ? <span>{o.qty}×${o.price}</span> : <b>${view.total}</b>}
      <span className={`chip ${o.paid ? 'tone-ok' : 'tone-dim'}`}>{o.paid ? 'paid' : 'unpaid'}</span>
    </motion.div>
  );
}
