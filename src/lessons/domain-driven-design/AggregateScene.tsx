import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { MAX_LINES, START_LINES, interleavingName, interleavings, run, stepName, tally, type Design } from './aggregate';
import { START_RUN_NOTE, runCaption, summaryCaption } from './captions';

const STEP_MS = 1400;
const TABLE_MIN_WIDTH = 440;
const SLOTS = MAX_LINES + 1;
const DESIGNS: { value: Design; label: string }[] = [
  { value: 'records', label: 'Lines as independent records' },
  { value: 'aggregate', label: 'Order as an aggregate' },
];
const ORDERS = interleavings();
const ORDER_OPTIONS = ORDERS.map((o, i) => ({ value: i, label: interleavingName(o) }));
const DEFAULT_ORDER = ORDERS.findIndex((o) => interleavingName(o) === 'R1 R2 W1 W2');

interface AggFrame extends Frame {
  lines: number;
  version: number;
}

export function AggregateScene({ picker }: { picker: ReactNode }) {
  const [design, setDesign] = useState<Design>('records');
  const [orderIndex, setOrderIndex] = useState(DEFAULT_ORDER);
  const order = ORDERS[orderIndex];
  const result = useMemo(() => run(design, order), [design, order]);
  const tallies = useMemo(() => ({ records: tally('records'), aggregate: tally('aggregate') }), []);

  const frames = useMemo<AggFrame[]>(
    () => [
      { lines: START_LINES, version: 0, say: START_RUN_NOTE },
      ...result.events.map((e, i): AggFrame => ({
        lines: e.lines,
        version: e.version,
        say: i === result.events.length - 1 ? `${e.note} ${runCaption(result)}` : e.note,
      })),
    ],
    [result],
  );
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame;
  const over = now.lines > MAX_LINES;

  return (
    <StageFrame
      player={player}
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a line in the order' },
            { color: 'var(--bad)', label: 'a line over the limit' },
            { color: 'var(--ok)', label: 'the limit held' },
            { color: 'var(--hi)', label: 'the step now' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Lines now" value={`${now.lines} of ${MAX_LINES}`} color={over ? 'var(--bad)' : undefined} sub={over ? 'over the limit' : `limit ${MAX_LINES}`} />
          <Stat label="Version" value={design === 'aggregate' ? now.version : 'not kept'} sub={design === 'aggregate' ? 'the check on every write' : 'independent records have none'} />
          <Stat label="Broken interleavings" value={`${tallies[design].violations} of ${tallies[design].runs.length}`} color={tallies[design].violations ? 'var(--bad)' : 'var(--ok)'} sub={summaryCaption(design)} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Design" value={design} onChange={setDesign} options={DESIGNS} />
        </>,
        <Segmented key="order" label="Order the steps happen in" value={orderIndex} onChange={setOrderIndex} options={ORDER_OPTIONS} />,
      ]}
    >
      <div className="stage-pad ddd">
        <Box className="ddd-card">
          <SectionTitle weight="regular" hint="R reads and checks, W writes; each actor adds one line">The steps</SectionTitle>
          <ol className="ddd-steps" aria-label="The steps in the order they happen">
            {order.map((s, i) => (
              <li key={i} className={`chip tone-${i + 1 === player.index ? 'hi' : i < player.index ? 'muted' : 'dim'}`}>{stepName(s)}</li>
            ))}
          </ol>
        </Box>
        <Box className="ddd-card">
          <SectionTitle weight="regular" hint={`limit ${MAX_LINES}`}>The order's lines</SectionTitle>
          <CellGrid
            rows={1}
            cols={SLOTS}
            size="md"
            colLabels={Array.from({ length: SLOTS }, (_, i) => (i < MAX_LINES ? String(i + 1) : 'over'))}
            ariaLabel={`The order holds ${now.lines} lines`}
            cell={(_, c) => (c < now.lines ? { tone: c >= MAX_LINES ? 'bad' : 'info', fill: 'solid', text: 'line' } : { fill: 'outline', tone: c >= MAX_LINES ? 'bad' : undefined })}
          />
        </Box>
        <Box className="ddd-card">
          <SectionTitle weight="regular" hint="every interleaving of the two actors, both designs">All six, run</SectionTitle>
          <WideRegion minWidth={TABLE_MIN_WIDTH} label="All six interleavings: scroll sideways to see all of it">
            <table className="data-table">
              <thead>
                <tr><th scope="col">Order</th><th scope="col">Independent records</th><th scope="col">Aggregate with a version</th></tr>
              </thead>
              <tbody>
                {ORDERS.map((o, i) => {
                  const a = tallies.records.runs[i];
                  const b = tallies.aggregate.runs[i];
                  return (
                    <tr key={i} className={i === orderIndex ? 'is-selected' : undefined}>
                      <th scope="row" className="ddd-rowhead">{interleavingName(o)}</th>
                      <td><span className={`chip tone-${a.violated ? 'bad' : 'ok'}`}>{a.finalLines} lines{a.violated ? ', over' : ''}</span></td>
                      <td><span className={`chip tone-${b.violated ? 'bad' : 'ok'}`}>{b.finalLines} lines{b.violated ? ', over' : ''}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </WideRegion>
        </Box>
        <div className="ddd-chips">
          <Provenance kind="toy">two actors and one order, every interleaving run</Provenance>
          <Provenance kind="illustrative">the limit of 5 lines is invented</Provenance>
        </div>
        <Hint block>
          An aggregate is a boundary inside which an invariant holds, enforced by one root. Here the version check is how optimistic concurrency keeps the limit; it is not the only way, and it protects only what is inside the boundary.
        </Hint>
      </div>
    </StageFrame>
  );
}
