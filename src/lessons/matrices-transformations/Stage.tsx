import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Arrow, Plot2D, Polygon, Segments } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ease } from '../../core/math';
import { useMeasure } from '../../core/useMeasure';
import { usePlayer } from '../../core/usePlayer';
import { composeFrames, composeStageMatrix, homogeneousCaption, num, pt, sig, transformCaption } from './frames';
import {
  COMPOSE_PRESETS, CSS_UNIT_PX, ENTRY_MAX, F_SHAPE, LINEAR_CHOICES, PRESETS, TRANSFORM_PRESETS, UNIT_SQUARE, applyH, applyM,
  columns, cssMatches, cssMatrix, cssMatrixArgs, det2, gridSegments, homogeneous, inverse2, isSingular, lerpM, parseCssMatrix,
  parseEntry, sameMatrix, thenApply, type M2, type M3, type P2, type PresetId,
} from './model';
import './styles.css';

type Scene = 'transform' | 'compose' | 'homogeneous';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'transform', label: 'Transform' },
  { value: 'compose', label: 'Compose' },
  { value: 'homogeneous', label: 'Homogeneous 3×3' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'transform' });
  if (scene === 'compose') return <ComposeScene picker={picker} />;
  if (scene === 'homogeneous') return <HomogeneousScene picker={picker} />;
  return <TransformScene picker={picker} />;
}

/** 356 × 350 gives a square inner box with Plot2D's margins, so the grid's squares stay square. */
const PLOT_W = 356;
const PLOT_H = 350;
const EXTENT = 4;
const TWEEN_MS = 450;

const flat = (m: M2) => [m[0][0], m[0][1], m[1][0], m[1][1]];
const fromFlat = (v: readonly number[]): M2 => [[v[0], v[1]], [v[2], v[3]]];

/**
 * The matrix being drawn glides to `target` over TWEEN_MS whenever target changes, so a preset
 * visibly bends the plane. Every in-between frame is a real matrix applied to real points.
 */
function useTweenedMatrix(target: M2): M2 {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  // Keyed by value, not identity: callers may build an equal matrix on every render.
  const key = flat(target).join(',');
  useEffect(() => {
    const to = fromFlat(key.split(',').map(Number));
    const from = current.current;
    if (sameMatrix(from, to)) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const m = lerpM(from, to, ease(t));
      current.current = m;
      setShown(m);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return shown;
}

/** The plane under a matrix: warped grid, unit square (det area), original and moved F, î and ĵ. */
function WarpPlot({ m, ariaLabel, showBasis = true, extent = EXTENT }: { m: M2; ariaLabel: string; showBasis?: boolean; extent?: number }) {
  const d = det2(m);
  const [i, j] = columns(m);
  const squareTone = isSingular(m) ? 'dim' : d > 0 ? 'ok' : 'orange';
  return (
    <Plot2D x={{ domain: [-extent, extent] }} y={{ domain: [-extent, extent] }} width={PLOT_W} height={PLOT_H} className="mt-plot" ariaLabel={ariaLabel}>
      <Segments segments={gridSegments(m)} tone="dim" />
      <Polygon points={UNIT_SQUARE.map((p) => applyM(m, p))} tone={squareTone} />
      <Polygon points={F_SHAPE} tone="dim" dashed />
      <Polygon points={F_SHAPE.map((p) => applyM(m, p))} tone="hi" />
      {showBasis && <Arrow to={i} tone="info" label="î" />}
      {showBasis && <Arrow to={j} tone="violet" label="ĵ" />}
    </Plot2D>
  );
}

/** A 2×2 (or 3×3) as a bracketed grid; the first two columns wear î's and ĵ's colours. */
function MatrixView({ rows, className = '' }: { rows: readonly (readonly number[])[]; className?: string }) {
  return (
    <span className={`mt-matrix ${className}`} role="img" aria-label={`matrix ${rows.map((r) => r.map((v) => num(v)).join(', ')).join('; ')}`}>
      {rows.map((r, ri) =>
        r.map((v, ci) => (
          <span key={`${ri}-${ci}`} className={ci === 0 ? 'is-i' : ci === 1 ? 'is-j' : 'is-t'} style={{ gridRow: ri + 1, gridColumn: ci + 1 }}>
            {num(v)}
          </span>
        )),
      )}
    </span>
  );
}

// ── Transform ────────────────────────────────────────────────────────

const ENTRY_NAMES = ['a', 'b', 'c', 'd'] as const;
const ENTRY_HINTS = ['î’s x', 'ĵ’s x', 'î’s y', 'ĵ’s y'];
const SLIDER_STEP = 0.05;

const textsOf = (m: M2) => flat(m).map((v) => num(v));

function TransformScene({ picker }: { picker: ReactNode }) {
  const [target, setTarget] = useState<M2>(PRESETS.identity.m);
  const [texts, setTexts] = useState<string[]>(textsOf(PRESETS.identity.m));
  const [errors, setErrors] = useState<(string | null)[]>([null, null, null, null]);
  const [loaded, setLoaded] = useState<PresetId | null>('identity');
  const setCaption = useSetCaption();
  const shown = useTweenedMatrix(target);
  const d = det2(target);
  const inv = inverse2(target);

  useIntroCaption(<>The identity matrix leaves the plane alone: î stays at (1, 0) and ĵ at (0, 1). Pick a preset, or type or slide the four
    entries, and watch the grid, the F and the unit square bend.</>);

  const commit = (m: M2, quiet: boolean) => {
    setTarget(m);
    setCaption(transformCaption(m), { quiet });
  };

  const load = (id: PresetId) => {
    const m = PRESETS[id].m;
    setLoaded(id);
    setTexts(textsOf(m));
    setErrors([null, null, null, null]);
    commit(m, false);
  };

  const type = (k: number, text: string) => {
    const nextTexts = texts.map((t, i) => (i === k ? text : t));
    setTexts(nextTexts);
    const parsed = parseEntry(text);
    setErrors(errors.map((e, i) => (i === k ? (parsed.ok ? null : parsed.error) : e)));
    if (!parsed.ok) return; // keep drawing the last valid matrix
    setLoaded(null);
    commit(fromFlat(flat(target).map((v, i) => (i === k ? parsed.value : v))), true);
  };

  const slide = (k: number, value: number) => {
    setTexts(texts.map((t, i) => (i === k ? num(value) : t)));
    setErrors(errors.map((e, i) => (i === k ? null : e)));
    setLoaded(null);
    commit(fromFlat(flat(target).map((v, i) => (i === k ? value : v))), true);
  };

  /** Leaving a refused field puts back the value still being drawn. */
  const restore = (k: number) => {
    if (!errors[k]) return;
    setTexts(texts.map((t, i) => (i === k ? textsOf(target)[k] : t)));
    setErrors(errors.map((e, i) => (i === k ? null : e)));
  };

  const [i, j] = columns(target);
  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label={<>where <span className="keep-case">î</span> lands</>} value={pt(i, 2)} color="var(--info)" sub="column 1: (a, c)" />
          <Stat label={<>where <span className="keep-case">ĵ</span> lands</>} value={pt(j, 2)} color="var(--violet)" sub="column 2: (b, d)" />
          <Stat
            label="det = ad − bc"
            value={sig(isSingular(target) ? 0 : d)}
            color={isSingular(target) ? undefined : d > 0 ? 'var(--ok)' : 'var(--orange)'}
            sub={isSingular(target) ? 'plane collapses' : d < 0 ? `areas ×${sig(-d)}, flipped` : `areas ×${sig(d)}`}
          />
          <Stat label="inverse" value={inv ? <MatrixView rows={inv} className="is-small" /> : 'none'} color={inv ? undefined : 'var(--bad)'} sub={inv ? undefined : 'can’t be undone'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'î and column 1', shape: 'line' },
            { color: 'var(--violet)', label: 'ĵ and column 2', shape: 'line' },
            { color: 'var(--hi)', label: 'transformed F' },
            { color: 'var(--dim)', label: 'original F (dashed), warped grid' },
            { color: 'var(--ok)', label: 'unit square, det > 0' },
            { color: 'var(--orange)', label: 'unit square, det < 0 (flipped)' },
          ]}
        />
      }
      controls={[
        <>{picker}</>,
        <ControlGroup key="presets" label="Presets">
          {TRANSFORM_PRESETS.map((id) => (
            <ChipButton key={id} tone="info" on={loaded === id} onClick={() => load(id)}>{PRESETS[id].label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad mt-row">
        <WarpPlot m={shown} ariaLabel={`Plane transformed by the matrix with columns ${pt(i)} and ${pt(j)}`} />
        <Box className="mt-editor">
          <SectionTitle hint={`each between −${ENTRY_MAX} and ${ENTRY_MAX}`}>The matrix</SectionTitle>
          <div className="mt-entries">
            {ENTRY_NAMES.map((name, k) => (
              <div key={name} className={`mt-entry ${k % 2 === 0 ? 'is-i' : 'is-j'}`}>
                <TextField
                  label={`${name} · ${ENTRY_HINTS[k]}`}
                  value={texts[k]}
                  onChange={(t) => type(k, t)}
                  onBlur={() => restore(k)}
                  width={84}
                  spellCheck={false}
                />
                <Slider label={`Slide ${name}`} value={flat(target)[k]} min={-ENTRY_MAX} max={ENTRY_MAX} step={SLIDER_STEP} format={(v) => num(v)} onChange={(v) => slide(k, v)} />
              </div>
            ))}
          </div>
          {errors.some(Boolean) && (
            <p className="mt-error" role="alert">
              {errors.find(Boolean)} Still drawing the last valid matrix.
            </p>
          )}
          <Hint block>x′ = a·x + b·y and y′ = c·x + d·y. Nothing here is simulated: every line is the matrix applied to real points.</Hint>
        </Box>
      </div>
    </StageFrame>
  );
}

// ── Compose ──────────────────────────────────────────────────────────

const COMPOSE_OPTIONS = COMPOSE_PRESETS.map((id) => ({ value: id, label: PRESETS[id].label }));

function ComposeScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState<PresetId>('rotate');
  const [b, setB] = useState<PresetId>('stretch');
  const [frames, setFrames] = useState(() => composeFrames('rotate', 'stretch'));
  const player = usePlayer(frames, { interval: 1400, autoplayOnChange: false });
  const stage = player.frame.stage;
  const left = useTweenedMatrix(composeStageMatrix(a, b, stage));
  const right = useTweenedMatrix(composeStageMatrix(b, a, stage));
  const ba = thenApply(PRESETS[a].m, PRESETS[b].m);
  const ab = thenApply(PRESETS[b].m, PRESETS[a].m);
  const same = sameMatrix(ba, ab);

  const pick = (na: PresetId, nb: PresetId) => {
    setA(na);
    setB(nb);
    setFrames(composeFrames(na, nb));
  };

  return (
    <StageFrame
      player={player}
      height={PLOT_H + 80}
      stats={
        <Stats>
          <Stat label="B·A (A first)" value={<MatrixView rows={ba} />} />
          <Stat label="A·B (B first)" value={<MatrixView rows={ab} />} />
          <Stat label="Same?" value={same ? 'yes' : 'no'} sub={same ? 'these two commute' : 'order matters'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'F after the steps so far' },
            { color: 'var(--dim)', label: 'starting F (dashed), warped grid' },
            { color: 'var(--ok)', label: 'unit square, det > 0' },
            { color: 'var(--orange)', label: 'unit square, det < 0' },
            { color: 'var(--info)', label: 'î', shape: 'line' },
            { color: 'var(--violet)', label: 'ĵ', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="A" options={COMPOSE_OPTIONS} value={a} onChange={(v) => pick(v, b)} />
        </>,
        <Segmented key="b" label="B" options={COMPOSE_OPTIONS} value={b} onChange={(v) => pick(a, v)} />,
      ]}
    >
      <div className="stage-pad mt-compose">
        <figure className="mt-side">
          <figcaption>A, then B <span>= B·A</span></figcaption>
          <WarpPlot m={left} ariaLabel={`${PRESETS[a].label} then ${PRESETS[b].label}, step ${stage} of 2`} />
        </figure>
        <figure className="mt-side">
          <figcaption>B, then A <span>= A·B</span></figcaption>
          <WarpPlot m={right} ariaLabel={`${PRESETS[b].label} then ${PRESETS[a].label}, step ${stage} of 2`} />
        </figure>
      </div>
    </StageFrame>
  );
}

// ── Homogeneous 3×3 ──────────────────────────────────────────────────

const LINEAR_OPTIONS = LINEAR_CHOICES.map((id) => ({ value: id, label: PRESETS[id].label }));
const T_MAX = 2;
const T_STEP = 0.5;
const H_EXTENT = 5;
/** The real-CSS box: a 2 × 2-unit element with its top-left corner on the origin. */
const BOX_UNITS = 2;

function HomogeneousScene({ picker }: { picker: ReactNode }) {
  const [linear, setLinear] = useState<PresetId>('rotate');
  const [t, setT] = useState<P2>([1, 1]);
  const setCaption = useSetCaption();
  const h = homogeneous(PRESETS[linear].m, t);

  useIntroCaption(homogeneousCaption(homogeneous(PRESETS.rotate.m, [1, 1])));

  const change = (l: PresetId, nt: P2, quiet: boolean) => {
    setLinear(l);
    setT(nt);
    setCaption(homogeneousCaption(homogeneous(PRESETS[l].m, nt)), { quiet });
  };

  const moved = F_SHAPE.map((p) => applyH(h, p));
  return (
    <StageFrame
      height={PLOT_H + 40}
      stats={
        <Stats>
          <Stat label="3×3 matrix" value={<MatrixView rows={h} />} sub="last column = translation" />
          <Stat label="origin goes to" value={pt(applyH(h, [0, 0]), 1)} color="var(--pink)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'transformed F' },
            { color: 'var(--dim)', label: 'original F (dashed)' },
            { color: 'var(--pink)', label: 'translation t', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Linear part" options={LINEAR_OPTIONS} value={linear} onChange={(l) => change(l, t, false)} />
        </>,
        <>
          <Slider label="tx" value={t[0]} min={-T_MAX} max={T_MAX} step={T_STEP} format={(v) => num(v)} onChange={(v) => change(linear, [v, t[1]], true)} />
          <Slider label="ty" value={t[1]} min={-T_MAX} max={T_MAX} step={T_STEP} format={(v) => num(v)} onChange={(v) => change(linear, [t[0], v], true)} />
        </>,
      ]}
    >
      <div className="stage-pad mt-row">
        <Plot2D x={{ domain: [-H_EXTENT, H_EXTENT] }} y={{ domain: [-H_EXTENT, H_EXTENT] }} width={PLOT_W} height={PLOT_H} className="mt-plot" ariaLabel={`F moved by the 3×3 matrix; origin goes to ${pt(t, 1)}`}>
          <Polygon points={F_SHAPE} tone="dim" dashed />
          <Polygon points={moved} tone="hi" />
          <Arrow to={t} tone="pink" label="t" />
        </Plot2D>
        <CssBox h={h} />
      </div>
    </StageFrame>
  );
}

/** The same matrix, written as CSS and applied by the browser to a real element. */
function CssBox({ h }: { h: M3 }) {
  const box = useRef<HTMLDivElement>(null);
  const css = cssMatrix(h);
  const computed = useMeasure(box, (el) => getComputedStyle(el).transform);
  const browser = computed ? parseCssMatrix(computed) : null;
  const ours = cssMatrixArgs(h);
  const matches = cssMatches(ours, browser);
  // The browser's own DOMMatrix maps a corner of the box; ours must land on the same pixel.
  const corner = browser ? new DOMMatrix(browser).transformPoint(new DOMPoint(CSS_UNIT_PX, 0)) : null;
  const want = applyH(h, [1, 0]).map((v) => v * CSS_UNIT_PX);
  const pointMatches = !!corner && Math.abs(corner.x - want[0]) < 1e-3 && Math.abs(corner.y - want[1]) < 1e-3;
  return (
    <Box className="mt-css">
      <SectionTitle hint="real CSS transform, applied by your browser">CSS</SectionTitle>
      <code className="mt-css-code">transform: {css};</code>
      <div className="mt-css-stage" aria-hidden="true">
        <div className="mt-css-axis is-x" />
        <div className="mt-css-axis is-y" />
        <div ref={box} className="mt-css-box" style={{ transform: css, width: BOX_UNITS * CSS_UNIT_PX, height: BOX_UNITS * CSS_UNIT_PX }}>F</div>
      </div>
      <p className="mt-css-check">
        Browser reports <code>{computed ?? '…'}</code>:{' '}
        <b className={matches && pointMatches ? 'is-ok' : 'is-bad'}>{matches && pointMatches ? 'matches the 3×3 (to the 4 decimals written)' : 'does not match'}</b>
      </p>
      <Hint block>
        CSS's y axis points down, so the same numbers turn the box clockwise where the plot turns counter-clockwise, and f &gt; 0 moves it
        down. Translation is in px: {CSS_UNIT_PX} px per unit. transform-origin is set to the top-left corner (CSS's default is the centre).
      </Hint>
    </Box>
  );
}
