import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { FORMAT_NAMES } from './anatomy';
import { LEAF_CAPACITY, POOL_PAGES, RECENT, replay, type Snapshot } from './btree';
import { indexCaption } from './captions';
import type { FormatId } from './formats';
import { makeIds } from './stream';

const TOTAL = 2000;
const STEP = 100;
const COLS = 16;
const FORMATS = (Object.keys(FORMAT_NAMES) as FormatId[]).map((value) => ({ value, label: FORMAT_NAMES[value] }));
const HONEST = `A simplified simulation: the index is only its leaf level, a page holds ${LEAF_CAPACITY} keys (real pages hold many more), and memory keeps the ${POOL_PAGES} most recently used pages. The IDs are real formats, generated from a seed.`;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: `page written in the last ${RECENT} inserts`, shape: 'square' },
      { color: 'var(--bad)', label: 'page made by a split', shape: 'square' },
      { color: 'var(--dim)', label: 'older page (fuller is brighter)', shape: 'square' },
    ]}
  />
);

export function IndexScene({ picker }: { picker: ReactNode }) {
  const [format, setFormat] = useState<FormatId>('uuidv4');
  const [at, setAt] = useState(TOTAL / STEP / 2);
  // every format's run, once: the table compares them all at the same number of inserts
  const runs = useMemo(
    () => Object.fromEntries(FORMATS.map(({ value }) => [value, replay(makeIds(value, TOTAL), STEP)])) as Record<FormatId, Snapshot[]>,
    [],
  );
  const snap = runs[format][at];
  useIntroCaption(indexCaption(format, snap), [format, at]);
  const rows = Math.max(1, Math.ceil(snap.pages.length / COLS));

  return (
    <StageFrame
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label={`Pages written, last ${RECENT}`} value={snap.touched} color="var(--hi)" sub={`of ${snap.pages.length} pages`} />
          <Stat label="Middle splits" value={snap.middleSplits} color={snap.middleSplits ? 'var(--bad)' : undefined} sub="half a page's keys moved" />
          <Stat label="Page reads from disk" value={snap.misses} sub={`page not among the ${POOL_PAGES} last used`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="ID" value={format} onChange={setFormat} options={FORMATS} />
        </>,
        <Slider key="n" label="Inserts" value={at * STEP} min={0} max={TOTAL} step={STEP} onChange={(v) => setAt(v / STEP)} format={(v) => v.toLocaleString('en-US')} />,
      ]}
    >
      <div className="stage-pad idg">
        <CellGrid
          className="idg-grid"
          rows={rows}
          cols={COLS}
          size="sm"
          ariaLabel={`Index leaf pages after ${snap.inserts} ${FORMAT_NAMES[format]} inserts`}
          cell={(r, c) => {
            const p = snap.pages[r * COLS + c];
            if (!p) return { fill: 'none' };
            if (p.recentSplit) return { tone: 'bad', fill: 'solid' };
            if (p.recent) return { tone: 'hi', fill: 'solid' };
            return { tone: 'dim', fill: 'tint', intensity: 0.15 + 0.6 * (p.count / LEAF_CAPACITY) };
          }}
          cellTitle={(r, c) => {
            const p = snap.pages[r * COLS + c];
            return p ? `page ${r * COLS + c + 1} of ${snap.pages.length}: ${p.count} keys` : '';
          }}
        />
        <table className="data-table idg-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Pages written, last {RECENT}</th>
              <th scope="col">Middle splits</th>
              <th scope="col">Page reads</th>
            </tr>
          </thead>
          <tbody>
            {FORMATS.map(({ value, label }) => {
              const s = runs[value][at];
              return (
                <tr key={value} className={value === format ? 'is-on' : undefined}>
                  <th scope="row">{label}</th>
                  <td>{s.touched}</td>
                  <td className={s.middleSplits ? 'idg-split' : undefined}>{s.middleSplits}</td>
                  <td>{s.misses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
