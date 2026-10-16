import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { cacheFrames, percent, size } from './captions';
import { DEFAULT_CAP_OFF, MAX_CAPACITY, MAX_FILE_PAGES, MIN_CAPACITY, MIN_FILE_PAGES, hitRatio, makeTrace, simulate, type CacheConfig, type Method, type Pattern } from './cache';
import {
  DEFAULT_CAPACITY, DEFAULT_FILE_PAGES, DEFAULT_METHOD, DEFAULT_PATTERN, DEFAULT_TRACE_SEED, GRID_COLS, RING_TONE, pageLook, processViews, traceConfig,
} from './view';

const METHOD_OPTIONS = [{ value: 'read' as const, label: 'read() into a buffer' }, { value: 'mmap' as const, label: 'mmap the file' }];
const PATTERN_OPTIONS: { value: Pattern; label: string }[] = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'random', label: 'Random' },
  { value: 'repeat', label: 'Repeat the same 8 pages' },
  { value: 'two', label: 'Two processes, same file' },
];
const CELL = { cell: 22 };
const GRID_MIN_WIDTH = 420;
const STEP_MS = 350;

export function ReadScene({ picker }: { picker: ReactNode }) {
  const [method, setMethod] = useState<Method>(DEFAULT_METHOD);
  const [pattern, setPattern] = useState<Pattern>(DEFAULT_PATTERN);
  const [filePages, setFilePages] = useState(DEFAULT_FILE_PAGES);
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const [seed, setSeed] = useState(DEFAULT_TRACE_SEED);

  const config: CacheConfig = useMemo(() => ({ filePages, capacity, method, windowCap: DEFAULT_CAP_OFF }), [filePages, capacity, method]);
  const trace = useMemo(() => makeTrace(traceConfig(pattern, filePages, seed)), [pattern, filePages, seed]);
  const steps = useMemo(() => simulate(config, trace), [config, trace]);
  const frames = useMemo(() => cacheFrames(config, steps), [config, steps]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const i = player.frame.index;
  const s = steps[i];
  const c = s.counters;
  const rows = Math.ceil(filePages / GRID_COLS);
  const { views, shared } = processViews(s, trace.slice(0, i));
  const two = pattern === 'two';

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Disk reads" value={c.diskPages} color="var(--bad)" sub="pages read from disk" />
          <Stat label="Minor faults" value={c.minor} color="var(--info)" sub="mapped from the cache" />
          <Stat label="Major faults" value={c.major} color="var(--bad)" sub="had to read the disk" />
          <Stat label="Copied to user space" value={size(c.bytesCopied)} color={c.bytesCopied > 0 ? 'var(--orange)' : undefined} sub={method === 'read' ? 'one copy per read()' : 'a mapping copies nothing'} />
          <Stat label="Hit ratio" value={c.accesses === 0 ? 'none yet' : percent(hitRatio(c))} sub={`${c.hits} of ${c.accesses} accesses`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'a page not cached (outlined)', shape: 'square' },
            { color: 'var(--ok)', label: 'cached, clean', shape: 'square' },
            { color: 'var(--violet)', label: 'a page mapped by both processes', shape: 'square' },
            { color: 'var(--bad)', label: 'ring: a disk read (a major fault under mmap; a read() miss also copies)', shape: 'square' },
            { color: 'var(--info)', label: 'ring: a minor fault', shape: 'square' },
            { color: 'var(--orange)', label: 'ring: a copy to user space from a page already cached', shape: 'square' },
            { color: 'var(--hi)', label: 'ring: a plain access of a mapped page', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Access method" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
        </>,
        <>
          <Segmented label="Access pattern" value={pattern} onChange={setPattern} options={PATTERN_OPTIONS} />
          <SeedField seed={seed} onSeed={setSeed} label={pattern === 'random' ? 'Seed' : 'Seed (random only)'} />
        </>,
        <>
          <Slider label="File size" value={filePages} min={MIN_FILE_PAGES} max={MAX_FILE_PAGES} step={8} onChange={setFilePages} format={(v) => `${v} pages`} />
          <Slider label="Page cache holds" value={capacity} min={MIN_CAPACITY} max={MAX_CAPACITY} step={8} onChange={setCapacity} format={(v) => `${v} pages`} />
        </>,
      ]}
    >
      <div className="mp-stage stage-pad">
        <Box>
          <SectionTitle hint={`${filePages} pages of 4 KB; a letter marks the process that has the page mapped (mmap)`}>The file in the page cache</SectionTitle>
          <WideRegion minWidth={GRID_MIN_WIDTH} label="The file's pages: scroll sideways to see all of them">
            <CellGrid
              rows={rows}
              cols={GRID_COLS}
              size={CELL}
              rowLabels={Array.from({ length: rows }, (_, r) => r * GRID_COLS)}
              cell={(r, col) => (r * GRID_COLS + col < filePages ? pageLook(s, r * GRID_COLS + col) : { fill: 'none' })}
              highlight={s.access && s.outcome ? [{ r: Math.floor(s.access.page / GRID_COLS), c: s.access.page % GRID_COLS, tone: RING_TONE[s.outcome] }] : []}
              cellTitle={(r, col) => `page ${r * GRID_COLS + col}: ${s.cached[r * GRID_COLS + col] ? 'cached' : 'not cached'}`}
              ariaLabel={`File of ${filePages} pages, ${s.cached.filter(Boolean).length} in the page cache`}
            />
          </WideRegion>
          <div className="mp-procs">
            {views.slice(0, two ? 2 : 1).map((v) => (
              <div key={v.name} className="mp-proc">
                <b>Process {v.name}</b>
                <span>{v.accesses} accesses so far</span>
                <span>{method === 'mmap' ? `${v.mappedPages} pages mapped` : 'no mappings: read() copies'}</span>
              </div>
            ))}
            {two && method === 'mmap' && <div className="mp-proc is-shared"><b>Shared</b><span>{shared} {shared === 1 ? 'page' : 'pages'} mapped by both</span></div>}
          </div>
          <Hint tone="muted" block>
            The cache holds {capacity} of {filePages} pages and evicts the least recently used. Readahead is off in this scene{pattern === 'random' ? `; the random accesses use seed ${seed}` : ''}.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>an LRU toy with a {MAX_FILE_PAGES}-page file at most; Linux uses more elaborate lists, per-device writeback and read-ahead heuristics</Provenance>
          <Provenance kind="from-memory">minor and major fault names, and a mapped read costing no copy: check man 2 mmap. On Linux 6.18 (WSL2) two page touches made one minor fault, because the kernel can map several cached pages in one fault, which this toy does not</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
