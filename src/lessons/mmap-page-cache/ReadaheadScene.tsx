import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { percent, plural, readaheadCaption } from './captions';
import { WINDOW_CAPS, finalOf, hitRatio, hitRatioByWindow, makeTrace, simulate, wastedPrefetch, type Pattern } from './cache';
import {
  GRID_COLS, READAHEAD_CAPACITY, READAHEAD_DEFAULT_CAP_INDEX, READAHEAD_FILE_PAGES, READAHEAD_PATTERN, READAHEAD_SEED, readaheadLook, traceConfig,
} from './view';

const PATTERN_OPTIONS: { value: Pattern; label: string }[] = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'random', label: 'Random' },
  { value: 'mixed', label: 'Runs of 8, then a jump' },
];
const CELL = { cell: 22 };
const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 220;
const GRID_MIN_WIDTH = 420;
const GRID_ROWS = READAHEAD_FILE_PAGES / GRID_COLS;

export function ReadaheadScene({ picker }: { picker: ReactNode }) {
  const [pattern, setPattern] = useState<Pattern>(READAHEAD_PATTERN);
  const [capIndex, setCapIndex] = useState(READAHEAD_DEFAULT_CAP_INDEX);
  const windowCap = WINDOW_CAPS[capIndex];
  const trace = useMemo(() => makeTrace(traceConfig(pattern, READAHEAD_FILE_PAGES, READAHEAD_SEED)), [pattern]);
  const base = useMemo(() => ({ filePages: READAHEAD_FILE_PAGES, capacity: READAHEAD_CAPACITY, method: 'read' as const }), []);
  const curve = useMemo(() => hitRatioByWindow(base, trace), [base, trace]);
  const last = useMemo(() => finalOf(simulate({ ...base, windowCap }, trace)), [base, trace, windowCap]);
  const c = last.counters;
  const label = PATTERN_OPTIONS.find((p) => p.value === pattern)!.label;

  return (
    <StageFrame
      height={430}
      intro={readaheadCaption(label, windowCap, last)}
      introKey={[last, label, windowCap]}
      stats={
        <Stats>
          <Stat label="Hit ratio" value={percent(hitRatio(c))} color="var(--ok)" sub={`${c.hits} of ${c.accesses} accesses`} />
          <Stat label="Disk requests" value={c.ios} color="var(--bad)" sub={`bringing in ${plural(c.diskPages, 'page')}`} />
          <Stat label="Read ahead, never used" value={wastedPrefetch(last)} color={wastedPrefetch(last) > 0 ? 'var(--orange)' : undefined} sub={`of ${c.prefetched} read ahead`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a cached page that was used', shape: 'square' },
            { color: 'var(--orange)', label: 'a page read ahead and not used (outlined)', shape: 'square' },
            { color: 'var(--dim)', label: 'not cached', shape: 'square' },
            { color: 'var(--info)', label: 'hit ratio at each window, computed by running this trace', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Access pattern" value={pattern} onChange={setPattern} options={PATTERN_OPTIONS} />
        </>,
        <>
          <Slider label="Readahead window up to" value={capIndex} min={0} max={WINDOW_CAPS.length - 1} onChange={setCapIndex} format={(i) => (WINDOW_CAPS[i] === 1 ? 'off (1 page)' : `${WINDOW_CAPS[i]} pages (${WINDOW_CAPS[i] * 4} KB)`)} />
        </>,
      ]}
    >
      <div className="mp-stage stage-pad">
        <div className="mp-two">
          <Box>
            <SectionTitle hint="the window doubles on each sequential miss, up to the cap, and resets on a random jump">Hit ratio against window</SectionTitle>
            <Plot2D
              x={{ domain: [1, 32], label: 'readahead window cap (pages)' }}
              y={{ domain: [0, 1], label: 'hit ratio', format: (v: number) => `${Math.round(v * 100)}%` }}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
              ariaLabel={`Hit ratio against readahead window for a ${label.toLowerCase()} trace`}
            >
              <Curve points={curve.map((p) => [p.windowCap, p.ratio] as [number, number])} tone="info" />
              <Points data={curve.map((p) => ({ x: p.windowCap, y: p.ratio, tone: p.windowCap === windowCap ? ('hi' as const) : ('info' as const) }))} r={4} />
              <VLine at={windowCap} label={`${windowCap}`} />
            </Plot2D>
          </Box>
          <Box>
            <SectionTitle hint="the cache at the end of the trace">The cache afterwards</SectionTitle>
            <WideRegion minWidth={GRID_MIN_WIDTH} label="The file's pages: scroll sideways to see all of them">
              <CellGrid
                rows={GRID_ROWS}
                cols={GRID_COLS}
                size={CELL}
                rowLabels={Array.from({ length: GRID_ROWS }, (_, r) => r * GRID_COLS)}
                cell={(r, col) => readaheadLook(last, r * GRID_COLS + col)}
                cellTitle={(r, col) => `page ${r * GRID_COLS + col}`}
                ariaLabel="Pages in the cache after the trace"
              />
            </WideRegion>
          </Box>
        </div>
        <Hint tone="muted" block>A window of 1 is no readahead: every miss reads one page. The cache here holds the whole file, so no page is evicted.</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={READAHEAD_SEED}>the same {trace.length}-access trace is run through the model at each window to draw the curve</Provenance>
          <Provenance kind="from-memory">a 128 KB cap is the usual default of read_ahead_kb: this WSL2 kernel said 128 on its virtual disks and 8192 on its sd disks, so check the kernel docs and your device</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
