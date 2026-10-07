import { useMemo, useState } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { toBits } from '../../core/bits';
import { latency, pct } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { cacheFrames, hex } from './frames';
import { ADDRESS_BITS, ARRAYS, CACHE, HONESTY, hitRate, illustrativeNs, L1_NS, lineOf, RAM_NS, sceneAddresses, sceneFor, simulateCache, tally, type LayoutId, type Order } from './model';
import './styles.css';

const STEP_MS = 650;
const CACHE_CELL = { cell: 64, gap: 4, font: 11 } as const;
/** 16 columns of these plus the address labels fit a 390px phone with 10px text at 8px or more. */
const MEMORY_CELL = { cell: 20, gap: 2, font: 10 } as const;

const LAYOUTS: { value: LayoutId; label: string }[] = [
  { value: 'small', label: ARRAYS.small.label },
  { value: 'wide', label: ARRAYS.wide.label },
  { value: 'stride', label: 'Rows 64 ints apart' },
  { value: 'structs', label: 'Structs' },
];

export function Stage() {
  const [layout, setLayout] = useState<LayoutId>('wide');
  const [order, setOrder] = useState<Order>('rows');
  const scene = useMemo(() => sceneFor(layout, order), [layout, order]);
  const { accesses, frames } = useMemo(() => cacheFrames(scene), [scene]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const i = player.frame.i;
  const a = i >= 0 ? accesses[i] : null;
  const shown = tally(accesses.slice(0, i + 1));

  // "Why it matters": the same work, both loop orders, start to finish.
  const compare = useMemo(() => {
    const rate = (o: Order) => hitRate(tally(simulateCache(sceneAddresses(sceneFor(layout, o)), CACHE)));
    return { rows: rate('rows'), cols: rate('cols') };
  }, [layout]);

  const cachedLines = new Set((a?.after ?? []).flat().map((w) => w.line).filter((l): l is number => l !== null));
  const visitedBefore = new Set(scene.visits.slice(0, Math.max(0, i)).map(([r, c]) => `${r},${c}`));
  const arrayCell = (r: number, c: number): GridCellSpec => {
    const text = scene.field?.(r, c);
    const addr = scene.addr(r, c);
    const [vr, vc] = a ? scene.visits[i] : [-1, -1];
    if (r === vr && c === vc) return { text, tone: 'hi', fill: 'solid' };
    if (a && lineOf(addr, CACHE) === a.line) return { text, tone: 'info', fill: 'tint', intensity: 0.42 };
    if (cachedLines.has(lineOf(addr, CACHE))) return { text, tone: 'info', fill: 'outline' };
    return { text, tone: visitedBefore.has(`${r},${c}`) ? 'dim' : undefined, fill: visitedBefore.has(`${r},${c}`) ? 'tint' : undefined };
  };

  const cacheCell = (set: number, way: number): GridCellSpec => {
    const line = a?.after[set][way].line ?? null;
    const text = line === null ? 'empty' : hex(line);
    if (a && set === a.split.set && way === a.way) return { text, tone: a.hit ? 'ok' : 'bad', fill: 'solid' };
    if (a && set === a.split.set) return { text, tone: 'violet', fill: line === null ? 'outline' : 'tint', intensity: 0.3 };
    return line === null ? { text, fill: 'none' } : { text };
  };

  const split = a?.split;
  const bits = toBits(a?.addr ?? 0, ADDRESS_BITS);
  const orderOptions =
    layout === 'structs'
      ? [
          { value: 'rows' as const, label: 'Array of structs' },
          { value: 'cols' as const, label: 'Struct of arrays' },
        ]
      : [
          { value: 'rows' as const, label: 'Row-wise a[i][j]' },
          { value: 'cols' as const, label: 'Column-wise' },
        ];
  const accessLine = scene.code.length - 1;

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Hits" value={shown.hits} color="var(--ok)" />
          <Stat label="Misses" value={shown.misses} color="var(--bad)" sub={`${shown.compulsory} compulsory · ${shown.capacity} capacity · ${shown.conflict} conflict`} />
          <Stat label="Hit rate" value={i >= 0 ? pct(hitRate(shown)) : '–'} />
          <Stat label="Time" value={latency(illustrativeNs(shown))} sub={`illustrative: ${L1_NS} ns hit, ${RAM_NS} ns miss`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'reading now', shape: 'square' },
            { color: 'var(--info)', label: 'its cache line (outlined: other cached lines)', shape: 'square' },
            { color: 'var(--violet)', label: 'the set it maps to', shape: 'square' },
            { color: 'var(--ok)', label: 'hit', shape: 'square' },
            { color: 'var(--bad)', label: 'miss', shape: 'square' },
            { color: 'var(--orange)', label: 'evicted', shape: 'square' },
          ]}
        />
      }
      controls={[
        <Segmented key="l" label="Array" value={layout} onChange={setLayout} options={LAYOUTS} />,
        <Segmented key="o" label="Loop" value={order} onChange={setOrder} options={orderOptions} />,
      ]}
    >
      <div className="cc stage-pad">
        <div className="cc-top">
          <CodePanel className="cc-code" title="the loop" lines={scene.code} active={a ? accessLine : null} />
          <Box className="cc-addr" role="group" aria-label="Address split">
            <SectionTitle>address {a ? hex(a.addr) : '–'}</SectionTitle>
            <BitStrip
              bits={bits}
              size="sm"
              groups={[
                { from: 0, to: (split?.bits.tag ?? 8) - 1, tone: 'info', label: `tag ${split ? hex(split.tag) : ''}` },
                { from: split?.bits.tag ?? 8, to: (split?.bits.tag ?? 8) + (split?.bits.set ?? 2) - 1, tone: 'violet', label: `set ${split?.set ?? ''}` },
                { from: ADDRESS_BITS - (split?.bits.offset ?? 6), to: ADDRESS_BITS - 1, tone: 'dim', label: `offset ${split?.offset ?? ''}` },
              ]}
            />
          </Box>
        </div>
        <div className="cc-panels">
          <div className="cc-panel">
            <SectionTitle>memory · {scene.layout === 'structs' ? '16 ints = one 64-byte line per row' : `${scene.rows} × ${scene.cols} ints`}</SectionTitle>
            <CellGrid
              className="cc-array"
              rows={scene.rows}
              cols={scene.cols}
              size={MEMORY_CELL}
              cell={arrayCell}
              rowLabels={Array.from({ length: scene.rows }, (_, r) => hex(scene.addr(r, 0)))}
              colLabels={scene.layout === 'structs' ? undefined : Array.from({ length: scene.cols }, (_, c) => String(c))}
              ariaLabel={`Memory: ${scene.rows} rows of ${scene.cols} ints${a ? `, reading ${hex(a.addr)}` : ''}`}
            />
          </div>
          <div className="cc-panel">
            <SectionTitle>cache · {CACHE.sets} sets × {CACHE.ways} ways × {CACHE.lineBytes} B</SectionTitle>
            <CellGrid
              className="cc-cache"
              rows={CACHE.sets}
              cols={CACHE.ways}
              size={CACHE_CELL}
              cell={cacheCell}
              rowLabels={Array.from({ length: CACHE.sets }, (_, s) => `set ${s}`)}
              colLabels={Array.from({ length: CACHE.ways }, (_, w) => `way ${w}`)}
              rowSuffix={{ width: 64, render: (s) => (!a ? '' : a.after[s].some((w) => w.line === null) ? `fills way ${a.lru[s]}` : `LRU: way ${a.lru[s]}`) }}
              ariaLabel="Cache sets and ways, showing which line each way holds"
            />
            <p className="cc-evict" aria-live="polite">
              {a?.evicted != null ? (
                <>
                  evicted <s>{hex(a.evicted)}</s>
                </>
              ) : (
                ' '
              )}
            </p>
          </div>
        </div>
        <p className="cc-why">
          <b>Why it matters:</b> the same {scene.visits.length} reads hit {pct(compare.rows)} of the time {layout === 'structs' ? 'as an array of structs' : 'row-wise'} and {pct(compare.cols)}{' '}
          {layout === 'structs' ? 'as a struct of arrays' : 'column-wise'}.
        </p>
        <Hint block>{HONESTY}</Hint>
      </div>
    </StageFrame>
  );
}
