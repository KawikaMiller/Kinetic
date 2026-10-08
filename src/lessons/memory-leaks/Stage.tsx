import { useMemo, useState } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { HeapObject, RefArrow, heapFieldPort, heapHeight, heapRect } from '../../components/memory';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { mb, verdictCaption } from './frames';
import { listingFor } from './listings';
import {
  MB, buildGraph, diff, heapRun, retainingPath, snapshot, survivorOf, verdict, type CacheFix, type Config, type Ctor, type Graph, type LeakId,
} from './model';
import './styles.css';

const PRESETS: { id: LeakId; label: string }[] = [
  { id: 'listener', label: 'Resize listener' },
  { id: 'cache', label: 'Unbounded cache' },
  { id: 'interval', label: 'Forgotten interval' },
  { id: 'errors', label: 'Growing error log' },
  { id: 'bigCache', label: 'High but flat' },
];
const CACHE_FIXES: { value: CacheFix; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'lru', label: 'LRU (100)' },
  { value: 'weakmap', label: 'WeakMap' },
];
const SNAPSHOT_GAP_MIN = 30;
const MAX_HOURS = 8;

export function Stage() {
  const [leak, setLeak] = useState<LeakId>('listener');
  const [fixes, setFixes] = useState<Record<LeakId, CacheFix>>({ listener: 'none', cache: 'none', interval: 'none', errors: 'none', bigCache: 'none' });
  const [hours, setHours] = useState(2);
  const [snapA, setSnapA] = useState(90);
  const [snapB, setSnapB] = useState<number | null>(120);
  const [picked, setPicked] = useState<Ctor | null>(null);

  const fixSetting = fixes[leak];
  const config: Config = useMemo(() => ({ leak, fix: fixSetting !== 'none', cacheFix: fixSetting === 'none' ? 'lru' : fixSetting }), [leak, fixSetting]);
  const minutes = hours * 60;
  const run = useMemo(() => heapRun(config, minutes), [config, minutes]);
  const v = verdict(run);
  const now = run.samples.at(-1)!.heap;

  const setFix = (f: CacheFix) => setFixes({ ...fixes, [leak]: f });
  const graphA = useMemo(() => buildGraph(config, snapA), [config, snapA]);
  const graphB = useMemo(() => (snapB === null ? null : buildGraph(config, snapB)), [config, snapB]);
  const rows = useMemo(() => (graphB ? diff(snapshot(graphA), snapshot(graphB)) : []), [graphA, graphB]);
  const shown = rows.filter((r) => r.delta !== 0 || r.b > 0).slice(0, 8);
  const ctor = picked && rows.some((r) => r.ctor === picked) ? picked : rows[0]?.ctor ?? null;
  const target = graphB && ctor ? survivorOf(graphA, graphB, ctor) : null;
  const path = graphB && target ? retainingPath(graphB, target.id) : null;

  const listing = listingFor(leak, config.fix, config.cacheFix);
  const lineState = (i: number): LineState => (i === listing.bad ? 'bad' : listing.good?.includes(i) ? 'good' : 'idle');

  useIntroCaption(verdictCaption(leak, run), [config, minutes, v.verdict]);

  const segs = run.samples.slice(1).map((s, i) => {
    const prev = run.samples[i];
    const drop = s.minute === prev.minute;
    return { from: [prev.minute / 60, prev.heap / MB] as [number, number], to: [s.minute / 60, s.heap / MB] as [number, number], tone: drop ? ('dim' as const) : ('info' as const) };
  });
  const yMax = Math.max(10, Math.ceil((Math.max(...run.samples.map((s) => s.heap)) / MB) * 1.1));

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Heap now" value={mb(now)} />
          <Stat label="Trough rise" value={`${mb(Math.max(0, v.growthPerHour))}/h`} color={v.verdict === 'leak' ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Verdict" value={v.verdict === 'leak' ? 'leaking' : leak === 'bigCache' ? 'high, flat' : 'flat'} color={v.verdict === 'leak' ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'heap size', shape: 'line' },
            { color: 'var(--dim)', label: 'GC drop', shape: 'line' },
            { color: 'var(--bad)', label: 'troughs climbing (leak)', shape: 'line' },
            { color: 'var(--ok)', label: 'troughs flat; fixed line', shape: 'line' },
            { color: 'var(--violet)', label: 'GC root' },
            { color: 'var(--hi)', label: 'retaining path', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={leak === p.id} onClick={() => { setLeak(p.id); setPicked(null); }}>
              {p.label}
            </ChipButton>
          ))}
        </>,
        <>
          {leak === 'cache' ? (
            <Segmented label="Fix" value={fixSetting} onChange={setFix} options={CACHE_FIXES} />
          ) : leak === 'bigCache' ? null : (
            <Toggle label="Fix" value={config.fix} onChange={(on) => setFix(on ? 'lru' : 'none')} off="Off" on="On" />
          )}
          <Slider label="App open for" value={hours} min={1} max={MAX_HOURS} step={0.5} onChange={setHours} format={(h) => `${h} h`} />
        </>,
      ]}
    >
      <div className="ml stage-pad">
        <div className="ml-row">
          <div className="ml-plot">
            <SectionTitle>heap over time · a GC every 10 min</SectionTitle>
            <Plot2D x={{ domain: [0, hours], label: 'hours', ticks: 4 }} y={{ domain: [0, yMax], label: 'MB', ticks: 4 }} width={356} height={240} ariaLabel="Heap size over time: a sawtooth with GC drops">
              <Segments segments={segs} />
              <Curve points={run.troughs.map((t) => [t.minute / 60, t.heap / MB] as [number, number])} tone={v.verdict === 'leak' ? 'bad' : 'ok'} dashed />
            </Plot2D>
          </div>
          <CodePanel className="ml-code" title={listing.title} lines={listing.lines} stateOf={lineState} />
        </div>
        <div className="ml-snap">
          <SectionTitle>heap snapshots · counts of live objects by constructor</SectionTitle>
          <div className="ml-snap-actions">
            <ChipButton tone="info" size="md" onClick={() => { setSnapA(minutes); setSnapB(null); }}>
              Take snapshot A now
            </ChipButton>
            <ChipButton
              tone="info"
              size="md"
              disabled={snapA + SNAPSHOT_GAP_MIN > MAX_HOURS * 60}
              onClick={() => { setSnapB(snapA + SNAPSHOT_GAP_MIN); setHours(Math.max(hours, (snapA + SNAPSHOT_GAP_MIN) / 60)); }}
            >
              Use the app {SNAPSHOT_GAP_MIN} min, then snapshot B
            </ChipButton>
            <span className="ml-note">A at {fmtMin(snapA)}{snapB !== null ? `, B at ${fmtMin(snapB)}` : ''}. Like DevTools, a snapshot collects garbage first.</span>
          </div>
          {snapB !== null && (
            <div className="ml-scroll">
              <table className="data-table ml-table">
                <thead>
                  <tr>
                    <th>constructor</th>
                    <th>A</th>
                    <th>B</th>
                    <th>+ delta</th>
                    <th>size delta</th>
                    <th>retainers</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.ctor} className={r.ctor === ctor ? 'is-picked' : ''}>
                      <td><code>{r.ctor}</code></td>
                      <td className="ml-num">{r.a.toLocaleString('en-US')}</td>
                      <td className="ml-num">{r.b.toLocaleString('en-US')}</td>
                      <td className={`ml-num ${r.delta > 0 ? 'ml-up' : ''}`}>{r.delta > 0 ? `+${r.delta.toLocaleString('en-US')}` : r.delta.toLocaleString('en-US')}</td>
                      <td className="ml-num">{r.deltaBytes > 0 ? `+${mb(r.deltaBytes)}` : r.deltaBytes < 0 ? `−${mb(-r.deltaBytes)}` : '0'}</td>
                      <td>
                        <ChipButton tone="hi" on={r.ctor === ctor} onClick={() => setPicked(r.ctor)} ariaLabel={`Show the retaining path of one ${r.ctor}`}>
                          path
                        </ChipButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {graphB && path && target && <RetainingPath g={graphB} path={path} survived={target.survived} leaked={target.survived && v.verdict === 'leak'} />}
        <Hint block>
          A simulated app and heap with illustrative sizes and rates; the code is what the model stands for, not code that runs. Real snapshots come from Chrome DevTools&apos;
          Memory panel or <code>node --inspect</code>, and their retainers view shows the same kind of path.
        </Hint>
        <Hint block>
          Weak references only help when the key&apos;s lifetime is the right one: a WeakMap entry goes when its key object is unreachable (and keys must be objects, so a
          string id can&apos;t be one). <code>WeakRef.deref()</code> returns the object or undefined depending on whether a GC has collected it yet, which you can&apos;t predict, so
          never let correctness depend on it.
        </Hint>
      </div>
    </StageFrame>
  );
}

const fmtMin = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

/* ---------- the retaining path ---------- */

const BOX_GAP = 40;
const PATH_TOP = 24;
const CHAR_W = 7.4;
const PATH_TEXT_PX = 11.5;

/** Boxes of these widths in one row, BOX_GAP apart: their top-left corners and the total width. */
function rowLayout(widths: readonly number[]) {
  const xs = widths.map((_, i) => 8 + widths.slice(0, i).reduce((a, w) => a + w + BOX_GAP, 0));
  return { at: xs.map((x) => ({ x, y: PATH_TOP })), width: xs.at(-1)! + widths.at(-1)! + 8 };
}

function RetainingPath({ g, path, survived, leaked }: { g: Graph; path: { id: string; via: string | null }[]; survived: boolean; leaked: boolean }) {
  const boxes = path.map((p, i) => {
    const n = g.nodes.get(p.id)!;
    const next = path[i + 1];
    const field = next ? next.via ?? '' : n.ctor;
    const w = Math.max(110, Math.max(n.name.length, field.length + 4) * CHAR_W + 24);
    return { p, n, field, w, last: !next };
  });
  const { at, width } = rowLayout(boxes.map((b) => b.w));
  const height = PATH_TOP + heapHeight(1) + 10;
  return (
    <div className="ml-path">
      <SectionTitle>
        retaining path · {survived ? `one ${boxes.at(-1)!.n.ctor} alive at both snapshots` : `the newest ${boxes.at(-1)!.n.ctor} (none survived from A)`} · from a GC root
      </SectionTitle>
      <WideRegion minWidth={Math.max(460, minWidthForText(width, PATH_TEXT_PX))} label="Retaining path: scroll sideways to see all of it">
        <svg className="ml-path-svg" style={{ maxWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Retaining path: ${boxes.map((b) => b.n.name).join(' → ')}`}>
          {boxes.map((b, i) => (
            <HeapObject
              key={b.p.id}
              at={at[i]}
              w={b.w}
              title={b.n.name}
              tone={i === 0 ? 'violet' : b.last && leaked ? 'bad' : 'muted'}
              fields={b.last ? [{ name: b.n.ctor, value: mb(b.n.size) }] : [{ name: b.field, isRef: true }]}
            />
          ))}
          {boxes.slice(0, -1).map((b, i) => (
            <RefArrow key={`a-${b.p.id}`} from={heapFieldPort(at[i], b.w, 0)} to={heapRect(at[i + 1], boxes[i + 1].w, 1)} tone="hi" />
          ))}
        </svg>
      </WideRegion>
    </div>
  );
}
