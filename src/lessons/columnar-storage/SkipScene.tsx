import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, plural } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { skipCaption } from './captions';
import { initialSkipScene } from './init';
import { DEFAULT_TABLE, SORT_KEYS, sortRows } from './table';
import { GROUP_ROWS, THRESHOLD_MAX, THRESHOLD_MIN, filteredSum, rowGroups } from './zones';

export function SkipScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialSkipScene);
  const { sort, threshold } = state;

  const rows = useMemo(() => sortRows(DEFAULT_TABLE, sort), [sort]);
  const groups = useMemo(() => rowGroups(rows), [rows]);
  const run = useMemo(() => filteredSum(rows, threshold, 'max'), [rows, threshold]);
  const skippedSet = new Set(run.skippedGroups);

  useIntroCaption(skipCaption(run, threshold, sort), [sort, threshold]);

  const shape = {
    rows: rows.length,
    cols: 1,
    size: 'md' as const,
    rowLabels: rows.map((_, i) => `row ${i + 1}`),
    rowDecor: (r: number) => (skippedSet.has(Math.floor(r / GROUP_ROWS)) ? { tone: 'dim' as const, label: '✓ skipped' } : { tone: 'hi' as const, label: 'read' }),
  };
  const frame = cellGridFrame({ ...shape, cols: 2 });

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Groups skipped" value={`${run.skippedGroups.length} of ${groups.length}`} color={run.skippedGroups.length > 0 ? 'var(--ok)' : undefined} sub="on min and max alone" />
          <Stat label="Bytes skipped" value={bytes(run.bytesSkipped)} color={run.bytesSkipped > 0 ? 'var(--ok)' : undefined} sub={`${bytes(run.bytesRead)} read`} />
          <Stat label="SUM(price)" value={run.sum} sub={`rows with qty > ${threshold}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'tick: a row group the zone map rules out', shape: 'square' },
            { color: 'var(--dim)', label: 'skipped rows (dim), never read', shape: 'square' },
            { color: 'var(--hi)', label: 'rail: a group that is read', shape: 'line' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Sort rows" value={sort} onChange={(s) => setState((st) => ({ ...st, sort: s }))} options={SORT_KEYS} />
          <Slider label="WHERE qty >" value={threshold} min={THRESHOLD_MIN} max={THRESHOLD_MAX} onChange={(t) => setState((st) => ({ ...st, threshold: t }))} />
        </>
      }
    >
      <div className="cs-stage stage-pad">
        <p className="cs-sql" aria-label="The query"><code>SELECT SUM(price) FROM t WHERE qty &gt; {threshold}</code></p>
        <Box>
          <SectionTitle hint={`${plural(groups.length, 'row group')} of ${GROUP_ROWS} rows, each with a min and max per column`}>Rows, qty and price</SectionTitle>
          <WideRegion minWidth={minWidthForText(frame.width, frame.size.font)} label="Row groups: scroll sideways to see all of it">
            <CellGrid
              {...shape}
              cols={2}
              colLabels={['qty', 'price']}
              cell={(r, c) => {
                const row = rows[r];
                const gone = skippedSet.has(Math.floor(r / GROUP_ROWS));
                const text = String(c === 0 ? row.qty : row.price);
                if (gone) return { tone: 'dim', fill: 'outline', text };
                const hit = row.qty > threshold;
                return c === 0 ? { tone: 'sky', fill: hit ? 'solid' : 'tint', intensity: 0.25, text } : { tone: 'orange', fill: hit ? 'solid' : 'tint', intensity: 0.25, text };
              }}
              ariaLabel={`${rows.length} rows in ${groups.length} row groups, ${run.skippedGroups.length} skipped`}
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="the footer of each row group, read before any data">Zone maps</SectionTitle>
          <ul className="cs-zones">
            {groups.map((g) => (
              <li key={g.index} className={skippedSet.has(g.index) ? 'cs-skipped' : 'cs-read'}>
                <b>group {g.index + 1}</b> qty from {g.qtyMin} to {g.qtyMax}:{' '}
                {skippedSet.has(g.index) ? <span className="cs-cheap">✓ skipped, its largest qty is at most {threshold}</span> : <span>read, it may hold qty above {threshold}</span>}
              </li>
            ))}
          </ul>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">4 row groups of 4 rows, a chunk is 16 bytes, and the zone maps are in a footer that is not counted as bytes read</Provenance>
          <Provenance kind="from-memory">row group, column chunk and page are the vocabulary of Parquet-style files; this model does not reproduce the format (check the Parquet documentation)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
