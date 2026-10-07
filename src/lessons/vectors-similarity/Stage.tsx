import { useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Box, SectionTitle } from '../../components/Panel';
import { Arrow, Plot2D, Points, Segments } from '../../components/Plot2D';
import { usePlot } from '../../components/plotContext';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Point } from '../../core/plot';
import { dotCaption, neighbourCaption, num, vec } from './frames';
import {
  DOCS, DOC_EXTENT, QUERY_PRESETS, TOP_K, VECTOR_PRESETS, isZero, plotExtent, rank, read, snapV, topIds,
  type Metric, type V2, type VectorPreset,
} from './model';
import './styles.css';

type Scene = 'dot' | 'neighbours';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'dot', label: 'Dot & cosine' },
  { value: 'neighbours', label: 'Nearest neighbours' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'dot' });
  return scene === 'dot' ? <DotScene picker={picker} /> : <NeighbourScene picker={picker} />;
}

/**
 * Both plots are aspect="equal", so right angles look right and the distance ring is a
 * circle: 350 tall at PLOT_W, which the stages leave room for.
 */
const PLOT_W = 356;
const PLOT_H = 350;

const UNDEFINED = 'undefined';

// ── Dot & cosine ─────────────────────────────────────────────────────

/** The opening pair: not a special case, so both arrows, the shadow and θ are all visible. */
const START_A: V2 = [3, 1];
const START_B: V2 = [1.5, 3];

function DotScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState<V2>(START_A);
  const [b, setB] = useState<V2>(START_B);
  const [doubled, setDoubled] = useState(false);
  const [pinned, setPinned] = useState<V2 | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const setCaption = useSetCaption();
  const shownB: V2 = doubled ? [b[0] * 2, b[1] * 2] : b;
  const r = read(a, shownB);
  const extent = plotExtent([a, shownB, ...(pinned ? [pinned] : [])]);
  const bName = doubled ? '2b' : 'b';

  useIntroCaption(<>Two arrows from the origin. Drag their tips: the dot product multiplies matching components and adds them up, and the
    dashed shadow shows what that means.</>);

  const update = (next: { a?: V2; b?: V2; doubled?: boolean; pinned?: V2 | null }, quiet = false) => {
    const na = next.a ?? a;
    const nb = next.b ?? b;
    const nd = next.doubled ?? doubled;
    const np = next.pinned === undefined ? pinned : next.pinned;
    setA(na);
    setB(nb);
    setDoubled(nd);
    setPinned(np);
    setCaption(dotCaption(na, nd ? [nb[0] * 2, nb[1] * 2] : nb, nd, np), { quiet });
  };

  const load = (p: VectorPreset) => {
    setLoaded(p.id);
    update({ a: p.a, b: p.b, doubled: false, pinned: p.pinned ?? null });
  };

  const drag = (i: number, p: Point) => {
    setLoaded(null);
    const tip = snapV(i === 1 && doubled ? [p[0] / 2, p[1] / 2] : p);
    update(i === 0 ? { a: tip } : { b: tip }, true);
  };

  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label={<span className="keep-case">a</span>} value={vec(a)} color="var(--info)" sub={`‖a‖ ≈ ${num(r.normA)}`} />
          <Stat label={<span className="keep-case">{bName}</span>} value={vec(shownB)} color="var(--violet)" sub={`‖${bName}‖ ≈ ${num(r.normB)}`} />
          <Stat label={<span className="keep-case">a·{bName}</span>} value={<AnimatedValue value={num(r.dot)} />} />
          <Stat label={<span className="keep-case">θ</span>} value={r.angle === null ? UNDEFINED : `${num(r.angle, 1)}°`} />
          <Stat label={<span className="keep-case">cos θ</span>} value={r.cos === null ? UNDEFINED : num(r.cos, 3)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a', shape: 'line' },
            { color: 'var(--violet)', label: `${bName}, and its dashed shadow on a`, shape: 'line' },
            { color: 'var(--muted)', label: 'drop line and θ arc', shape: 'line' },
            ...(pinned ? [{ color: 'var(--muted)', label: 'b′, the pinned candidate (dashed)', shape: 'line' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Scale b" value={doubled} onChange={(d) => update({ doubled: d })} off="1×" on="2×" />
          <Button onClick={() => update({ pinned: shownB })}>Pin {bName} as b′</Button>
          {pinned && <Button onClick={() => update({ pinned: null })}>Clear b′</Button>}
        </>,
        <ControlGroup key="presets" label="Presets">
          {VECTOR_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={loaded === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad vs-dot">
        <Plot2D
          x={{ domain: [-extent, extent] }}
          y={{ domain: [-extent, extent] }}
          width={PLOT_W}
          aspect="equal"
          className="vs-plot"
          ariaLabel={`a = ${vec(a)}, ${bName} = ${vec(shownB)}, dot product ${num(r.dot)}`}
        >
          {r.shadow && !isZero(shownB) && (
            <Segments segments={[{ from: shownB, to: r.shadow, tone: 'muted' }]} dashed />
          )}
          <AngleArc a={a} b={shownB} />
          <Arrow to={a} tone="info" label="a" />
          {r.shadow && <ShadowSegment to={r.shadow} />}
          {pinned && (
            <Arrow to={pinned} tone="muted" label="b′" dashed />
          )}
          <Arrow to={shownB} tone="violet" label={bName} />
          <Points
            data={[{ x: a[0], y: a[1], tone: 'info' }, { x: shownB[0], y: shownB[1], tone: 'violet' }]}
            r={4}
            onDrag={drag}
            pointLabel={(i) => (i === 0 ? 'tip of a' : `tip of ${bName}`)}
          />
        </Plot2D>
        <Box className="vs-working">
          <SectionTitle hint="from the arrows on the plot">The arithmetic</SectionTitle>
          <p>
            a·{bName} = aₓ{bName}ₓ + a<sub>y</sub>{bName}<sub>y</sub> = {num(a[0], 1)} × {num(shownB[0], 1)} + {num(a[1], 1)} × {num(shownB[1], 1)} ={' '}
            <b>{num(r.dot)}</b>
          </p>
          <p>
            cos θ = a·{bName} / (‖a‖‖{bName}‖) ={' '}
            {r.cos === null
              ? <>{num(r.dot)} / 0: <b className="vs-undefined">{UNDEFINED}</b> (a zero vector has no direction)</>
              : <>{num(r.dot)} / ({num(r.normA)} × {num(r.normB)}) ≈ <b>{num(r.cos, 3)}</b></>}
          </p>
          <Hint block>Tips snap to 0.1, so these sums are exact. Drag a tip, or focus it and use the arrow keys.</Hint>
        </Box>
      </div>
    </StageFrame>
  );
}

/** b's shadow on a's line: dashed violet, drawn over a so it shows even where they overlap. */
function ShadowSegment({ to }: { to: V2 }) {
  return (
    <g className="vs-shadow">
      <Segments segments={[{ from: [0, 0], to, tone: 'violet' }]} dashed />
    </g>
  );
}

const ARC_PX = 26;

/** The angle θ between the two arrows, as a small arc at the origin. */
function AngleArc({ a, b }: { a: V2; b: V2 }) {
  const { xs, ys } = usePlot();
  if (isZero(a) || isZero(b)) return null;
  const [ox, oy] = [xs.map(0), ys.map(0)];
  // Screen angles: y grows downward on screen, so negate.
  const ta = Math.atan2(-(ys.map(a[1]) - oy), xs.map(a[0]) - ox);
  let tb = Math.atan2(-(ys.map(b[1]) - oy), xs.map(b[0]) - ox);
  let d = tb - ta;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  tb = ta + d;
  const pt = (t: number, r = ARC_PX) => `${(ox + r * Math.cos(t)).toFixed(2)} ${(oy - r * Math.sin(t)).toFixed(2)}`;
  const mid = ta + d / 2;
  return (
    <g className="vs-arc" aria-hidden="true">
      <path d={`M${pt(ta)} A${ARC_PX} ${ARC_PX} 0 0 ${d > 0 ? 0 : 1} ${pt(tb)}`} />
      <text x={ox + (ARC_PX + 10) * Math.cos(mid)} y={oy - (ARC_PX + 10) * Math.sin(mid) + 4} textAnchor="middle">θ</text>
    </g>
  );
}

// ── Nearest neighbours ───────────────────────────────────────────────

const METRICS: { value: Metric; label: string }[] = [
  { value: 'cosine', label: 'Cosine' },
  { value: 'euclidean', label: 'Distance' },
];

function NeighbourScene({ picker }: { picker: ReactNode }) {
  const [query, setQuery] = useState<V2>(QUERY_PRESETS[0].at);
  const [metric, setMetric] = useState<Metric>('cosine');
  const setCaption = useSetCaption();
  const ranked = rank(query, metric);
  const top = new Set(topIds(ranked));

  useIntroCaption(neighbourCaption(QUERY_PRESETS[0].at, 'cosine'));

  const change = (q: V2, m: Metric, quiet = false) => {
    setQuery(q);
    setMetric(m);
    setCaption(neighbourCaption(q, m), { quiet });
  };

  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="Query q" value={vec(query)} color="var(--hi)" />
          <Stat label="Ranking by" value={metric === 'cosine' ? 'cosine' : 'distance'} />
          <Stat label={`Top ${TOP_K}`} value={ranked ? [...top].join(' ') : UNDEFINED} color={ranked ? 'var(--ok)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'query q', shape: 'dot' },
            { color: 'var(--ok)', label: `top ${TOP_K}`, shape: 'dot' },
            { color: 'var(--dim)', label: 'the other documents', shape: 'dot' },
            ...(ranked ? [{ color: 'var(--muted)', label: metric === 'cosine' ? 'q’s direction (dashed)' : 'radius of the 3rd nearest (dashed)', shape: 'line' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Metric" options={METRICS} value={metric} onChange={(m) => change(query, m)} />
        </>,
        <ControlGroup key="presets" label="Queries">
          {QUERY_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={p.at[0] === query[0] && p.at[1] === query[1]} onClick={() => change(p.at, metric)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad vs-nn">
        <Plot2D
          x={{ domain: [0, DOC_EXTENT], label: '“cat” words' }}
          y={{ domain: [0, DOC_EXTENT], label: '“dog” words' }}
          width={PLOT_W}
          aspect="equal"
          className="vs-plot"
          ariaLabel={`12 documents as word-count vectors, query at ${vec(query)}`}
        >
          {metric === 'cosine' && !isZero(query) && <DirectionRay q={query} />}
          {metric === 'euclidean' && ranked && <RadiusRing at={query} r={ranked[TOP_K - 1].score} />}
          <Points data={DOCS.map((d) => ({ x: d.at[0], y: d.at[1], tone: top.has(d.id) ? 'ok' : 'dim' }))} r={4.5} />
          <Points
            data={[{ x: query[0], y: query[1], tone: 'hi' }]}
            r={5}
            onDrag={(_, p) => change(snapV(p), metric, true)}
            pointLabel={() => 'query q'}
          />
          <DocLabels top={top} />
        </Plot2D>
        <RankLists query={query} metric={metric} />
        <Hint block className="vs-note">Hand-picked 2D points: x and y count two words. Real embeddings have hundreds of dimensions.</Hint>
      </div>
    </StageFrame>
  );
}

/** A dashed ray from the origin through q to the plot's edge: every point on it has cosine 1 with q. */
function DirectionRay({ q }: { q: V2 }) {
  const reach = DOC_EXTENT / Math.max(q[0], q[1]);
  return <Segments segments={[{ from: [0, 0], to: [q[0] * reach, q[1] * reach], tone: 'muted' }]} dashed />;
}

function RadiusRing({ at, r }: { at: V2; r: number }) {
  const { xs, ys, clip } = usePlot();
  const rx = Math.abs(xs.map(r) - xs.map(0));
  const ry = Math.abs(ys.map(r) - ys.map(0));
  return <ellipse className="vs-ring" cx={xs.map(at[0])} cy={ys.map(at[1])} rx={rx} ry={ry} clipPath={`url(#${clip})`} aria-hidden="true" />;
}

/** Cosines of near neighbours differ in the 4th place; distances read fine at 2. */
const COS_DP = 4;
const DIST_DP = 2;

const LABEL_DX = 6;
const LABEL_DY = -6;

function DocLabels({ top }: { top: Set<string> }) {
  const { xs, ys } = usePlot();
  return (
    <g className="vs-labels" aria-hidden="true">
      {DOCS.map((d) => (
        <text key={d.id} className={top.has(d.id) ? 'is-top' : ''} x={xs.map(d.at[0]) + LABEL_DX} y={ys.map(d.at[1]) + LABEL_DY}>
          {d.id}
        </text>
      ))}
    </g>
  );
}

function RankLists({ query, metric }: { query: V2; metric: Metric }) {
  return (
    <div className="vs-lists">
      {METRICS.map((m) => {
        const ranked = rank(query, m.value);
        return (
          <Box key={m.value} className={`vs-list ${m.value === metric ? 'is-current' : ''}`}>
            <SectionTitle hint={m.value === 'cosine' ? 'higher is closer' : 'lower is closer'}>By {m.label.toLowerCase()}</SectionTitle>
            {ranked ? (
              <ol>
                {ranked.slice(0, TOP_K).map((it) => (
                  <li key={it.doc.id}>
                    <b>{it.doc.id}</b> {it.doc.title} <span className="vs-score">{num(it.score, m.value === 'cosine' ? COS_DP : DIST_DP)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-note">undefined for the zero vector</p>
            )}
          </Box>
        );
      })}
    </div>
  );
}
