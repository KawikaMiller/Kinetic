import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { Box as Panel, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, pct } from '../../core/format';
import { TOKENS } from '../../core/palette';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { drawRealCanvas } from './draw';
import { centreVerdict, coverageFrames, DEPTH_NAMES, depthCaption, num, sharedCaption } from './frames';
import {
  COVERAGE_PRESET, DEPTH_PRESET, GRID_H, GRID_W, SHARED_PRESET, SLIVER_PRESET, SNAP, TINY_PRESET, barycentric, clampVertex,
  depthAt, drawDepth, inBox, isWrong, wrongPixels, pixelKey, sampleOffsets, sharedEdge, testPoint, wind, type Box, type FillRule, type Tri, type Vertex,
} from './model';
import './styles.css';

type Scene = 'coverage' | 'shared' | 'depth';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'coverage', label: 'Coverage' },
  { value: 'shared', label: 'Shared edge' },
  { value: 'depth', label: 'Depth' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'coverage' });
  if (scene === 'shared') return <SharedScene picker={picker} />;
  if (scene === 'depth') return <DepthScene picker={picker} />;
  return <CoverageScene picker={picker} />;
}

/** 22 px cells 2 px apart. Below 560 px the grid scrolls sideways (WideRegion) instead of shrinking its cells. */
const CELL = 22;
const GAP = 2;
const PITCH = CELL + GAP;
const BOARD_W = GRID_W * CELL + (GRID_W - 1) * GAP;
const BOARD_H = GRID_H * CELL + (GRID_H - 1) * GAP;
const MIN_WIDTH = 560;
/** Grid units (pixels) → board drawing units: pixel edges sit in the middle of the gaps. */
const toBoard = (u: number) => u * PITCH - GAP / 2;
const fromBoard = (s: number) => (s + GAP / 2) / PITCH;
const HONESTY = 'A software rasterizer written for this lesson; GPUs do the same tests in parallel hardware. Corners snap to ¼ pixel (GPUs snap to a finer fixed-point grid).';

interface Shape {
  tri: Tri;
  tone: Tone | 'muted';
}

/** The pixel grid (a CellGrid) with the triangles, the bounding box and the draggable corners drawn over it. */
function PixelBoard({
  cell, highlight = [], shapes, box, handles, samplePoints, probe, ariaLabel,
}: {
  cell: (x: number, y: number) => GridCellSpec;
  highlight?: GridHighlight[];
  shapes: Shape[];
  box?: Box | null;
  handles?: { points: readonly Vertex[]; onMove: (i: number, v: Vertex) => void; label: (i: number) => string };
  samplePoints?: { x: number; y: number; inside: boolean }[];
  probe?: { at: { x: number; y: number }; onMove: (x: number, y: number) => void };
  ariaLabel: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const toGrid = (clientX: number, clientY: number) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: fromBoard(p.x), y: fromBoard(p.y) };
  };

  const onHandleMove = (e: PointerEvent, i: number) => {
    if (dragging.current !== i || !handles) return;
    const p = toGrid(e.clientX, e.clientY);
    if (p) handles.onMove(i, clampVertex({ ...handles.points[i], ...p }));
  };

  const onHandleKey = (e: KeyboardEvent, i: number) => {
    if (!handles) return;
    const d = e.shiftKey ? 1 : 1 / SNAP;
    const step: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    const v = handles.points[i];
    handles.onMove(i, clampVertex({ ...v, x: v.x + s[0], y: v.y + s[1] }));
  };

  const onProbeKey = (e: KeyboardEvent) => {
    if (!probe) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    probe.onMove(Math.min(GRID_W - 1, Math.max(0, probe.at.x + s[0])), Math.min(GRID_H - 1, Math.max(0, probe.at.y + s[1])));
  };

  const onProbePointer = (e: PointerEvent) => {
    const p = probe && toGrid(e.clientX, e.clientY);
    if (!p || !probe) return;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && (x !== probe.at.x || y !== probe.at.y)) probe.onMove(x, y);
  };

  return (
    <div className="rz-board-wrap">
      <WideRegion minWidth={MIN_WIDTH} label="Pixel grid: scroll sideways to see all of it">
        <div className="rz-board">
          <CellGrid rows={GRID_H} cols={GRID_W} size={{ cell: CELL, gap: GAP, font: 0 }} cell={(r, c) => cell(c, r)} highlight={highlight} ariaLabel={ariaLabel} />
          <svg ref={svg} className="rz-overlay" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden={handles || probe ? undefined : true}>
            {probe && (
              <rect
                className="rz-probe-area"
                x={0}
                y={0}
                width={BOARD_W}
                height={BOARD_H}
                tabIndex={0}
                role="button"
                aria-label={`Depth probe at pixel (${probe.at.x}, ${probe.at.y}). Arrow keys move it.`}
                onPointerMove={onProbePointer}
                onPointerDown={onProbePointer}
                onKeyDown={onProbeKey}
              />
            )}
            {box && (
              <rect className="rz-bbox" x={toBoard(box.x0)} y={toBoard(box.y0)} width={(box.x1 - box.x0 + 1) * PITCH} height={(box.y1 - box.y0 + 1) * PITCH} />
            )}
            {shapes.map((s, i) => (
              <polygon key={i} className={`rz-tri tone-${s.tone}`} points={s.tri.map((v) => `${toBoard(v.x)},${toBoard(v.y)}`).join(' ')} />
            ))}
            {samplePoints?.map((p, i) => (
              <circle key={i} className={`rz-sample ${p.inside ? 'is-in' : ''}`} cx={toBoard(p.x)} cy={toBoard(p.y)} r={samplePoints.length > 4 ? 1.8 : 2.6} />
            ))}
            {handles?.points.map((v, i) => (
              <g
                key={i}
                className="rz-handle"
                role="button"
                tabIndex={0}
                aria-roledescription="draggable corner"
                aria-label={`${handles.label(i)} at (${num(v.x)}, ${num(v.y)}). Arrow keys move it a quarter pixel, Shift a whole pixel.`}
                onPointerDown={(e) => {
                  dragging.current = i;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.currentTarget.focus();
                }}
                onPointerMove={(e) => onHandleMove(e, i)}
                onPointerUp={() => (dragging.current = null)}
                onPointerCancel={() => (dragging.current = null)}
                onKeyDown={(e) => onHandleKey(e, i)}
              >
                <circle className="rz-handle-hit" cx={toBoard(v.x)} cy={toBoard(v.y)} r={14} />
                <circle className="rz-handle-dot" cx={toBoard(v.x)} cy={toBoard(v.y)} r={6} />
                <text className="rz-handle-label" x={toBoard(v.x) + 9} y={toBoard(v.y) - 8}>{handles.label(i).slice(-1)}</text>
              </g>
            ))}
          </svg>
        </div>
      </WideRegion>
    </div>
  );
}

/** The browser's own canvas fill of the same triangles, one canvas pixel per grid pixel. */
function RealCanvas({ shapes }: { shapes: { tri: Tri; color: string }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawRealCanvas(ctx, shapes, GRID_W, GRID_H);
  });
  return (
    <figure className="rz-real">
      <canvas ref={ref} width={GRID_W} height={GRID_H} aria-label="The same triangle drawn by your browser's canvas" role="img" />
      <figcaption>Real canvas: your browser's own renderer, {GRID_W} × {GRID_H} real pixels scaled up. It antialiases its own way.</figcaption>
    </figure>
  );
}

const CORNER = (i: number) => `Corner ${'ABCD'[i]}`;
const replaceAt = <T,>(xs: readonly T[], i: number, x: T) => xs.map((y, j) => (j === i ? x : y));

// ── Coverage ────────────────────────────────────────────────────────

type PresetId = 'default' | 'sliver' | 'tiny';
const PRESETS: { id: PresetId; label: string; tri: Tri }[] = [
  { id: 'default', label: 'Triangle', tri: COVERAGE_PRESET },
  { id: 'sliver', label: 'Sliver', tri: SLIVER_PRESET },
  { id: 'tiny', label: 'Tiny', tri: TINY_PRESET },
];
const SAMPLE_OPTIONS = [
  { value: 1, label: 'centre only' },
  { value: 2, label: '2×2' },
  { value: 4, label: '4×4' },
];
const RUN_INTERVAL = 140;

function CoverageScene({ picker }: { picker: ReactNode }) {
  const [tri, setTri] = useState<Tri>(COVERAGE_PRESET);
  const [n, setN] = useState(1);
  const [loaded, setLoaded] = useState<PresetId | null>('default');
  const [built, setBuilt] = useState(() => coverageFrames(COVERAGE_PRESET, 1));
  const player = usePlayer(built.frames, { interval: RUN_INTERVAL, autoplayOnChange: false });
  const { raster } = built;
  const frame = player.frame;
  const current = frame.current === null ? null : raster.tested[frame.current];

  /** Edits show the finished result at once; Step and play walk it again from the start. */
  const rebuild = (t: Tri, samples: number) => {
    const b = coverageFrames(t, samples);
    setBuilt(b);
    player.queueNext({ play: false, from: b.frames.length - 1 });
  };
  const load = (p: (typeof PRESETS)[number]) => {
    setLoaded(p.id);
    setTri(p.tri);
    const b = coverageFrames(p.tri, n);
    setBuilt(b);
    player.queueNext({ play: false, from: 0 });
  };
  const move = (i: number, v: Vertex) => {
    const next = replaceAt(tri, i, v) as unknown as Tri;
    setTri(next);
    setLoaded(null);
    rebuild(next, n);
  };

  const done = raster.tested.slice(0, frame.tested);
  const results = new Map(done.map((p) => [pixelKey(p.x, p.y), p.cover]));
  const coveredSoFar = done.filter((p) => p.cover > 0).length;
  const offs = sampleOffsets(n);
  const samplePoints = current && raster.tri
    ? offs.flatMap((oy) => offs.map((ox) => ({ x: current.x + ox, y: current.y + oy, inside: testPoint(raster.tri!, current.x + ox, current.y + oy, 'topLeft').inside })))
    : undefined;

  const cell = (x: number, y: number): GridCellSpec => {
    if (!inBox(raster.box, x, y)) return { tone: 'dim', fill: 'tint', intensity: 0.8 };
    const c = results.get(pixelKey(x, y));
    if (!c) return {};
    return c === 1 ? { tone: 'info', fill: 'solid' } : { tone: 'info', fill: 'tint', intensity: c };
  };

  const boxSize = raster.tested.length;
  return (
    <StageFrame
      player={player}
      height={BOARD_H + 60}
      stats={
        <Stats>
          <Stat label="pixels tested" value={`${frame.tested} / ${boxSize}`} sub={`of ${GRID_W * GRID_H} on the grid`} />
          <Stat label="pixels covered" value={coveredSoFar} color="var(--info)" sub={n === 1 ? 'centre inside' : 'any sample inside'} />
          <Stat label="box efficiency" value={frame.tested ? pct(coveredSoFar / frame.tested) : NA} sub="covered ÷ tested" />
          <Stat label="point tests" value={frame.tested * raster.samples} sub={`${raster.samples} per pixel`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'pixel being tested' },
            { color: 'var(--info)', label: n === 1 ? 'covered' : 'covered (shade = share of samples)' },
            { color: 'var(--dim)', label: 'outside the box: never tested' },
            { color: 'var(--ok)', label: 'edge passes', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={loaded === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <Segmented key="aa" label="Antialiasing: samples per pixel" options={SAMPLE_OPTIONS} value={n} onChange={(v) => { setN(v); rebuild(tri, v); }} />,
      ]}
    >
      <div className="stage-pad rz-row">
        <PixelBoard
          cell={cell}
          highlight={current ? [{ r: current.y, c: current.x, tone: 'hi' }] : []}
          shapes={[{ tri, tone: 'muted' }]}
          box={raster.box}
          handles={{ points: tri, onMove: move, label: CORNER }}
          samplePoints={samplePoints}
          ariaLabel={`${GRID_W} by ${GRID_H} pixel grid: ${coveredSoFar} of ${frame.tested} tested pixels covered`}
        />
        <div className="rz-side">
          <EdgePanel test={current?.centre ?? null} at={current} />
          <RealCanvas shapes={[{ tri, color: TOKENS.info }]} />
        </div>
      </div>
      <Hint block tone="muted" className="rz-honest">{HONESTY}</Hint>
    </StageFrame>
  );
}

/** The three edge-function values at the current pixel centre, each marked pass or fail. */
function EdgePanel({ test, at }: { test: ReturnType<typeof testPoint> | null; at: { x: number; y: number } | null }) {
  return (
    <Panel className="rz-edges" aria-live="polite">
      <SectionTitle hint={at ? `centre (${at.x + 0.5}, ${at.y + 0.5})` : 'step to test a pixel'}>Edge tests</SectionTitle>
      <ul className="rz-signs">
        {[0, 1, 2].map((i) => (
          <li key={i} className={test ? (test.pass[i] ? 'is-pass' : 'is-fail') : ''}>
            <span className="rz-sign-name">w{i}</span>
            <b>{test ? num(test.w[i]) : NA}</b>
            <span className="rz-sign-verdict">{test ? (test.pass[i] ? 'pass' : 'fail') : ''}</span>
          </li>
        ))}
      </ul>
      <p className="rz-verdict">{test ? <>{centreVerdict(test)}.</> : 'w ≥ 0 on all three edges means inside; exactly 0 counts only on a top or left edge.'}</p>
    </Panel>
  );
}

// ── Shared edge ─────────────────────────────────────────────────────

const RULES: { value: FillRule; label: string }[] = [
  { value: 'inclusive', label: 'w ≥ 0' },
  { value: 'exclusive', label: 'w > 0' },
  { value: 'topLeft', label: 'top-left rule' },
];
const SHARED_START = [SHARED_PRESET.s0, SHARED_PRESET.s1, SHARED_PRESET.pa, SHARED_PRESET.pb];

function SharedScene({ picker }: { picker: ReactNode }) {
  const [pts, setPts] = useState<readonly Vertex[]>(SHARED_START);
  const [rule, setRule] = useState<FillRule>('inclusive');
  const setCaption = useSetCaption();
  const [s0, s1, pa, pb] = pts;
  const result = sharedEdge(s0, s1, pa, pb, rule);

  useIntroCaption(sharedCaption(sharedEdge(SHARED_PRESET.s0, SHARED_PRESET.s1, SHARED_PRESET.pa, SHARED_PRESET.pb, 'inclusive'), 'inclusive'));

  const update = (next: readonly Vertex[], r: FillRule, quiet: boolean) => {
    setPts(next);
    setRule(r);
    setCaption(sharedCaption(sharedEdge(next[0], next[1], next[2], next[3], r), r), { quiet });
  };

  const twice = new Set(result.overdraw);
  const gaps = new Set(result.gaps);
  const cell = (x: number, y: number): GridCellSpec => {
    const k = pixelKey(x, y);
    if (twice.has(k)) return { tone: 'bad', fill: 'solid' };
    if (gaps.has(k)) return { tone: 'orange', fill: 'outline' };
    if (result.a.has(k)) return { tone: 'info', fill: 'solid' };
    if (result.b.has(k)) return { tone: 'sky', fill: 'solid' };
    return {};
  };

  return (
    <StageFrame
      height={BOARD_H + 60}
      stats={
        <Stats>
          <Stat label="drawn twice" value={result.overdraw.length} color={result.overdraw.length ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="missed on the edge" value={result.gaps.length} color={result.gaps.length ? 'var(--orange)' : 'var(--ok)'} />
          <Stat label="triangle A" value={result.a.size} color="var(--info)" sub="pixels" />
          <Stat label="triangle B" value={result.b.size} color="var(--sky)" sub="pixels" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'triangle A' },
            { color: 'var(--sky)', label: 'triangle B' },
            { color: 'var(--bad)', label: 'drawn twice (overdraw)' },
            { color: 'var(--orange)', label: 'missed: a crack (outlined)' },
          ]}
        />
      }
      controls={[
        <>{picker}</>,
        <Segmented key="rule" label="Centre exactly on an edge" options={RULES} value={rule} onChange={(r) => update(pts, r, false)} />,
      ]}
    >
      <div className="stage-pad rz-row">
        <PixelBoard
          cell={cell}
          shapes={[{ tri: [s0, s1, pa], tone: 'info' }, { tri: [s1, s0, pb], tone: 'sky' }]}
          handles={{ points: pts, onMove: (i, v) => update(replaceAt(pts, i, v), rule, true), label: CORNER }}
          ariaLabel={`Two triangles sharing the edge A to B: ${result.overdraw.length} pixels drawn twice, ${result.gaps.length} missed`}
        />
        <Panel className="rz-side rz-explain">
          <SectionTitle>Who owns a centre on the edge?</SectionTitle>
          <p>Triangles A-B-C and B-A-D share the edge A-B, which runs through pixel centres. A centre exactly on it gives w = 0 for both triangles.</p>
          <p><b>w ≥ 0</b> lets both take it, <b>w &gt; 0</b> lets neither. The <b>top-left rule</b> gives it to the triangle for which that edge is a top edge (flat, triangle below) or a left edge (triangle to its right), and exactly one of the two triangles sees it that way.</p>
        </Panel>
      </div>
      <Hint block tone="muted" className="rz-honest">{HONESTY}</Hint>
    </StageFrame>
  );
}

// ── Depth ───────────────────────────────────────────────────────────

const ORDERS: { value: string; label: string }[] = [
  { value: '0,1', label: 'violet, then amber' },
  { value: '1,0', label: 'amber, then violet' },
];
const DEPTH_TONES: Tone[] = ['violet', 'amber'];
const PROBE_START = { x: 9, y: 7 };
const z3 = (v: number) => v.toFixed(3);

function DepthScene({ picker }: { picker: ReactNode }) {
  const [zBuffer, setZBuffer] = useState(false);
  const [orderKey, setOrderKey] = useState('0,1');
  const [probe, setProbe] = useState(PROBE_START);
  const setCaption = useSetCaption();
  const order = orderKey.split(',').map(Number) as [number, number];
  const pixels = drawDepth(DEPTH_PRESET, order, zBuffer);

  useIntroCaption(depthCaption(DEPTH_PRESET, [0, 1], false));

  const change = (z: boolean, key: string) => {
    setZBuffer(z);
    setOrderKey(key);
    setCaption(depthCaption(DEPTH_PRESET, key.split(',').map(Number) as [number, number], z));
  };

  const wrong = wrongPixels(pixels);
  const cell = (x: number, y: number): GridCellSpec => {
    const s = pixels[pixelKey(x, y)].shown;
    return s < 0 ? {} : { tone: DEPTH_TONES[s], fill: 'solid' };
  };
  const wrongRings: GridHighlight[] = pixels.flatMap((p, k) => (isWrong(p) ? [{ r: Math.floor(k / GRID_W), c: k % GRID_W, tone: 'bad' as Tone }] : []));

  return (
    <StageFrame
      height={BOARD_H + 60}
      stats={
        <Stats>
          <Stat label="wrong pixels" value={wrong} color={wrong ? 'var(--bad)' : 'var(--ok)'} sub="farther triangle showing" />
          <Stat label="draw order" value={order.map((i) => DEPTH_NAMES[i]).join(' → ')} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'violet triangle' },
            { color: 'var(--amber)', label: 'amber triangle' },
            { color: 'var(--bad)', label: 'ring: the farther one is showing' },
            { color: 'var(--hi)', label: 'ring: probed pixel' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Z-buffer" value={zBuffer} onChange={(z) => change(z, orderKey)} />
        </>,
        <Segmented key="order" label="Draw order" options={ORDERS} value={orderKey} onChange={(k) => change(zBuffer, k)} />,
      ]}
    >
      <div className="stage-pad rz-row">
        <PixelBoard
          cell={cell}
          highlight={[...wrongRings, { r: probe.y, c: probe.x, tone: 'hi' }]}
          shapes={DEPTH_PRESET.map((tri, i) => ({ tri, tone: DEPTH_TONES[i] }))}
          probe={{ at: probe, onMove: (x, y) => setProbe({ x, y }) }}
          ariaLabel={`Two overlapping triangles, ${wrong} pixels showing the farther one`}
        />
        <DepthReadout at={probe} shown={pixels[pixelKey(probe.x, probe.y)].shown} />
      </div>
      <Hint block tone="muted" className="rz-honest">{HONESTY} Depth is interpolated linearly in screen space, which is right for z-buffer depth even in 3D (it is taken after the perspective divide); textures and colours in 3D need perspective correction.</Hint>
    </StageFrame>
  );
}

/** The probed pixel: each triangle's barycentric weights and interpolated z there, and who wins. */
function DepthReadout({ at, shown }: { at: { x: number; y: number }; shown: number }) {
  const px = at.x + 0.5;
  const py = at.y + 0.5;
  const rows = DEPTH_PRESET.map((input, i) => {
    const t = wind(input)!;
    const inside = testPoint(t, px, py, 'topLeft').inside;
    const l = barycentric(t, px, py);
    const z = depthAt(t, px, py);
    return { i, inside, l, z };
  });
  const covering = rows.filter((r) => r.inside);
  const nearest = covering.length ? covering.reduce((a, b) => (b.z < a.z ? b : a)) : null;
  const sameShown = covering.length === 2 && z3(covering[0].z) === z3(covering[1].z);
  return (
    <Panel className="rz-side rz-depth" aria-live="polite">
      <SectionTitle hint="hover the grid, or focus it and use the arrow keys">Pixel ({at.x}, {at.y})</SectionTitle>
      {rows.map((r) => (
        <p key={r.i} className={`rz-depth-row tone-${DEPTH_TONES[r.i]}`}>
          <b>{DEPTH_NAMES[r.i]}</b>{' '}
          {r.inside
            ? <>λ = ({r.l.map((w) => w.toFixed(2)).join(', ')}) → z = {z3(r.z)}</>
            : <span className="rz-muted">doesn't cover this centre</span>}
        </p>
      ))}
      <p className="rz-verdict">
        {nearest
          ? <>Nearer here: <b>{DEPTH_NAMES[nearest.i]}</b>{sameShown ? ' (they differ past the third decimal)' : ''}. On screen: {shown < 0 ? 'nothing' : <b>{DEPTH_NAMES[shown]}</b>}{shown >= 0 && shown !== nearest.i ? <span className="rz-wrong">: wrong</span> : ''}.</>
          : 'Neither triangle covers this pixel centre.'}
      </p>
      <p className="rz-muted">z = λ0·z0 + λ1·z1 + λ2·z2, smaller is nearer. Corners: z = 0.2 or 0.9.</p>
    </Panel>
  );
}
