import { useState, type ReactNode } from 'react';
import { ColorField } from '../../components/ColorField';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useElementSize } from '../../core/hooks';
import { contrastRatio, formatRatio, grade } from '../../core/contrast';
import { contrastCaption, f3, gammaCaption, gradientCaption, modelsCaption, pct1 } from './frames';
import {
  CONTRAST_PRESETS, GRADIENT_PRESETS, GRADIENT_SAMPLES, HSL_HALF, MIX_SPACES, OKLCH_EVEN, cssGradient, encode8, fallbackGradient,
  hexToRgb, hslToRgb, linearOf8, oklabOf, oklchOf, oklchToRgb, profile, pureGamma, rgb8, rgbToHex, rgbToHsl, rgbToHsv, srgbToLinear,
  type MixSpace, type Profile,
} from './model';
import './styles.css';

type Scene = 'gradients' | 'gamma' | 'models' | 'contrast';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'gradients', label: 'Gradients' },
  { value: 'gamma', label: 'Gamma' },
  { value: 'models', label: 'Models' },
  { value: 'contrast', label: 'Contrast' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'gradients' });
  if (scene === 'gamma') return <GammaScene picker={picker} />;
  if (scene === 'models') return <ModelsScene picker={picker} />;
  if (scene === 'contrast') return <ContrastScene picker={picker} />;
  return <GradientScene picker={picker} />;
}

const HONESTY = 'The gradients are drawn by your browser. The numbers come from the standard formulas. Your screen\'s own profile changes what you actually see.';
const WIDE_GAMUT = 'Wide-gamut screens (Display P3) and HDR can show colours outside sRGB; this lesson stays inside sRGB.';

// ── Gradients ───────────────────────────────────────────────────────

/** Whether this browser draws `linear-gradient(in <space>, …)`; checked once. */
const SUPPORTS: Record<MixSpace, boolean> = Object.fromEntries(
  MIX_SPACES.map((s) => [s, typeof CSS !== 'undefined' && CSS.supports('background-image', `linear-gradient(in ${s}, red, blue)`)]),
) as Record<MixSpace, boolean>;

/** The profile is drawn at the strip's own width, so its 10px ticks stay 10px; never narrower than this. */
const PROFILE_MIN_W = 300;
const PROFILE_H = 120;

function GradientScene({ picker }: { picker: ReactNode }) {
  const [from, setFrom] = useState<string>(GRADIENT_PRESETS[0].from);
  const [to, setTo] = useState<string>(GRADIENT_PRESETS[0].to);
  const setCaption = useSetCaption();
  const profiles = Object.fromEntries(MIX_SPACES.map((s) => [s, profile(from, to, s)])) as Record<MixSpace, Profile>;
  const loaded = GRADIENT_PRESETS.find((p) => p.from === from && p.to === to)?.id ?? null;

  useIntroCaption(gradientCaption(GRADIENT_PRESETS[0].from, GRADIENT_PRESETS[0].to, Object.fromEntries(MIX_SPACES.map((s) => [s, profile(GRADIENT_PRESETS[0].from, GRADIENT_PRESETS[0].to, s)])) as Record<MixSpace, Profile>));

  const set = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setCaption(gradientCaption(f, t, Object.fromEntries(MIX_SPACES.map((s) => [s, profile(f, t, s)])) as Record<MixSpace, Profile>));
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          {MIX_SPACES.map((s) => (
            <Stat key={s} label={<>midpoint L · <span className="keep-case">in {s}</span></>} value={f3(profiles[s].L[GRADIENT_SAMPLES / 2])} color={profiles[s].dip ? 'var(--bad)' : undefined} sub={profiles[s].dip ? 'dips below both ends' : 'no dip'} />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'perceived lightness (OKLab L) along the strip', shape: 'line' },
            { color: 'var(--bad)', label: 'deepest dip below both ends', shape: 'dot' },
            { color: 'var(--dim)', label: 'level of the darker end (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {GRADIENT_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={loaded === p.id} onClick={() => set(p.from, p.to)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <ColorField label="From" value={from} onChange={(v) => set(v, to)} />
          <ColorField label="To" value={to} onChange={(v) => set(from, v)} />
        </>,
      ]}
    >
      <div className="stage-pad cs-strips">
        {MIX_SPACES.map((s) => (
          <GradientStrip key={s} from={from} to={to} space={s} p={profiles[s]} />
        ))}
        <Hint block tone="muted">{HONESTY} {WIDE_GAMUT}</Hint>
      </div>
    </StageFrame>
  );
}

function GradientStrip({ from, to, space, p }: { from: string; to: string; space: MixSpace; p: Profile }) {
  const native = SUPPORTS[space];
  const floor = Math.min(p.L[0], p.L[GRADIENT_SAMPLES]);
  const pts = p.L.map((L, i) => [i / GRADIENT_SAMPLES, L] as const);
  const dipL = p.dip ? p.L[Math.round(p.dip.t * GRADIENT_SAMPLES)] : null;
  const [wrap, size] = useElementSize<HTMLElement>();
  return (
    <section ref={wrap} className="cs-strip">
      <div className="cs-strip-head">
        <code>linear-gradient(in {space}, …)</code>
        <span className="cs-strip-note">
          {native ? 'drawn by your browser' : `your browser can't draw "in ${space}": these are the model's own ${GRADIENT_SAMPLES + 1} stops`}
          {space === 'oklch' && p.outOfGamut > 0 ? ` · ${p.outOfGamut} samples outside sRGB` : ''}
        </span>
      </div>
      <div className="cs-gradient" style={{ backgroundImage: native ? cssGradient(from, to, space) : fallbackGradient(p) }} role="img" aria-label={`Gradient from ${from} to ${to} interpolated in ${space}`} />
      <Plot2D x={{ domain: [0, 1] }} y={{ domain: [0, 1], ticks: 3 }} width={Math.max(PROFILE_MIN_W, Math.round(size.width))} height={PROFILE_H} className="cs-profile" ariaLabel={`Perceived lightness along the ${space} gradient, from ${f3(p.L[0])} to ${f3(p.L[GRADIENT_SAMPLES])}${dipL !== null ? `, dipping to ${f3(dipL)}` : ''}`}>
        <HLine at={floor} tone="dim" />
        <Curve points={pts} tone="info" width={2.5} />
        {p.dip && dipL !== null && (
          <>
            <VLine at={p.dip.t} tone="bad" />
            <Points data={[{ x: p.dip.t, y: dipL }]} tone="bad" r={5} />
          </>
        )}
      </Plot2D>
    </section>
  );
}

// ── Gamma ───────────────────────────────────────────────────────────

const HALF_LIGHT = encode8(0.5);

function GammaScene({ picker }: { picker: ReactNode }) {
  const [v, setV] = useState(128);
  const setCaption = useSetCaption();
  useIntroCaption(gammaCaption(128));
  const set = (nv: number) => {
    const c = Math.round(Math.min(255, Math.max(0, nv)));
    setV(c);
    setCaption(gammaCaption(c), { quiet: true });
  };
  const grey = (g: number) => `rgb(${g} ${g} ${g})`;
  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="stored sRGB value" value={v} sub={`${pct1(v / 255)} of 255`} />
          <Stat label="linear light" value={pct1(linearOf8(v))} color="var(--info)" sub="IEC 61966-2-1" />
          <Stat label="plain 2.2 gamma says" value={pct1(pureGamma(v / 255))} sub="close, not equal" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'sRGB decoding curve', shape: 'line' },
            { color: 'var(--dim)', label: 'plain 2.2 gamma (dashed)', shape: 'line' },
            { color: 'var(--hi)', label: 'your grey (drag it)', shape: 'dot' },
            { color: 'var(--violet)', label: 'half the light: sRGB 188', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="sRGB value" value={v} min={0} max={255} format={(x) => String(x)} onChange={set} />
        </>,
      ]}
    >
      <div className="stage-pad cs-row">
        <Plot2D x={{ domain: [0, 255], label: 'stored sRGB value', tickValues: [0, 64, 128, 192, 255] }} y={{ domain: [0, 1], label: 'linear light' }} width={356} height={330} className="cs-gamma-plot" ariaLabel={`sRGB transfer curve; sRGB ${v} is ${pct1(linearOf8(v))} linear light`}>
          <Curve fn={(x) => pureGamma(x / 255)} tone="dim" dashed />
          <Curve fn={(x) => srgbToLinear(x / 255)} tone="info" width={3} />
          <VLine at={v} tone="dim" />
          <HLine at={linearOf8(v)} tone="dim" />
          <Points data={[{ x: HALF_LIGHT, y: linearOf8(HALF_LIGHT) }]} tone="violet" />
          <Points data={[{ x: v, y: linearOf8(v) }]} tone="hi" onDrag={(_, [x]) => set(x)} pointLabel={() => `sRGB ${v}`} />
        </Plot2D>
        <div className="cs-patches">
          <figure className="cs-patch">
            <div style={{ background: grey(v) }} />
            <figcaption>your grey: sRGB {v}<br /><b>{pct1(linearOf8(v))}</b> of the light</figcaption>
          </figure>
          <figure className="cs-patch">
            <div style={{ background: grey(128) }} />
            <figcaption>sRGB 128: half the numbers<br /><b>{pct1(linearOf8(128))}</b> of the light</figcaption>
          </figure>
          <figure className="cs-patch">
            <div style={{ background: grey(HALF_LIGHT) }} />
            <figcaption>sRGB {HALF_LIGHT}: half the light<br /><b>{pct1(linearOf8(HALF_LIGHT))}</b> (50% before rounding)</figcaption>
          </figure>
          <Hint block tone="muted">Images store light non-linearly so the 256 steps go where eyes notice them, in the darks. Maths on light (blending, blurring, resizing) should decode first.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}

// ── Models ──────────────────────────────────────────────────────────

/** The table's natural width: six columns of mono text. */
const TABLE_MIN = 780;
const START_HEX = '#3d9cf0'; // allow-color: the starting pick for the learner's colour picker

interface Row {
  label: string;
  hex: string;
  current?: boolean;
}

const fmt = {
  rgb: (hex: string) => `rgb(${rgb8(hexToRgb(hex)).join(' ')})`,
  hsl: (hex: string) => {
    const c = rgbToHsl(hexToRgb(hex));
    return `hsl(${Math.round(c.h)} ${Math.round(c.s * 100)}% ${Math.round(c.l * 100)}%)`;
  },
  hsv: (hex: string) => {
    const c = rgbToHsv(hexToRgb(hex));
    return `${Math.round(c.h)}° ${Math.round(c.s * 100)}% ${Math.round(c.v * 100)}%`;
  },
  oklch: (hex: string) => {
    const c = oklchOf(hex);
    return `oklch(${f3(c.L)} ${f3(c.C)} ${c.C < 1e-3 ? 'none' : c.h.toFixed(1)})`;
  },
};

const HSL_ROWS: Row[] = HSL_HALF.map((c) => ({ label: `HSL 50% ${c.name}`, hex: rgbToHex(hslToRgb(c.hsl)) }));
const OKLCH_ROWS: Row[] = OKLCH_EVEN.hues.map((c) => ({ label: `OKLCH ${OKLCH_EVEN.L.toFixed(2)} ${c.name}`, hex: rgbToHex(oklchToRgb({ L: OKLCH_EVEN.L, C: OKLCH_EVEN.C, h: c.h }).rgb) }));

function ModelsScene({ picker }: { picker: ReactNode }) {
  const [hex, setHex] = useState(START_HEX);
  const setCaption = useSetCaption();
  useIntroCaption(modelsCaption(START_HEX));
  const rows: Row[] = [{ label: 'your colour', hex, current: true }, ...HSL_ROWS, ...OKLCH_ROWS];
  return (
    <StageFrame
      height={380}
      legend={<Legend items={[{ color: 'var(--hi)', label: 'your colour\'s row' }]} />}
      controls={[
        <>
          {picker}
          <ColorField label="Your colour" value={hex} onChange={(v) => { setHex(v); setCaption(modelsCaption(v), { quiet: true }); }} />
        </>,
      ]}
    >
      <div className="stage-pad cs-models">
        <div className="cs-same">
          <SameRow title="HSL, all L = 50%" rows={HSL_ROWS} />
          <SameRow title={`OKLCH, all L = ${OKLCH_EVEN.L.toFixed(2)}, C = ${OKLCH_EVEN.C}`} rows={OKLCH_ROWS} />
        </div>
        <WideRegion minWidth={TABLE_MIN} label="Colour table: scroll sideways to see all of it" hint="swipe to see the whole table">
          <table className="data-table cs-table">
            <thead>
              <tr><th scope="col">colour</th><th scope="col">hex</th><th scope="col">RGB</th><th scope="col">HSL</th><th scope="col">HSV</th><th scope="col">OKLCH</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.current ? 'is-current' : ''}>
                  <th scope="row"><span className="cs-chip" style={{ background: r.hex }} />{r.label}</th>
                  <td>{r.hex}</td>
                  <td>{fmt.rgb(r.hex)}</td>
                  <td>{fmt.hsl(r.hex)}</td>
                  <td>{fmt.hsv(r.hex)}</td>
                  <td>{fmt.oklch(r.hex)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <Hint block tone="muted">Same colour, different coordinates. HSL and HSV are just RGB rearranged into a cylinder; OKLCH is built so that equal L looks equally light. OKLCH values are rounded; "none" means a grey has no hue.</Hint>
      </div>
    </StageFrame>
  );
}

/** Three swatches that share a "lightness" number, with their perceived lightness under each. */
function SameRow({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Box className="cs-same-row">
      <SectionTitle hint="perceived lightness (OKLab L) under each">{title}</SectionTitle>
      <div className="cs-same-swatches">
        {rows.map((r) => (
          <figure key={r.hex}>
            <div style={{ background: r.hex }} />
            <figcaption>{f3(oklabOf(r.hex).L)}</figcaption>
          </figure>
        ))}
      </div>
    </Box>
  );
}

// ── Contrast ────────────────────────────────────────────────────────

const [GREY_PAIR, BLUE_PAIR] = CONTRAST_PRESETS;
const deltaL = (p: { fg: string; bg: string }) => Math.abs(oklabOf(p.fg).L - oklabOf(p.bg).L);

const GRADE_LABELS: { key: keyof ReturnType<typeof grade>; label: string }[] = [
  { key: 'aaNormal', label: 'AA body text (4.5:1)' },
  { key: 'aaLarge', label: 'AA large text (3:1)' },
  { key: 'aaaNormal', label: 'AAA body text (7:1)' },
  { key: 'aaaLarge', label: 'AAA large text (4.5:1)' },
];

function ContrastScene({ picker }: { picker: ReactNode }) {
  const [fg, setFg] = useState<string>(CONTRAST_PRESETS[0].fg);
  const [bg, setBg] = useState<string>(CONTRAST_PRESETS[0].bg);
  const setCaption = useSetCaption();
  useIntroCaption(contrastCaption(CONTRAST_PRESETS[0].fg, CONTRAST_PRESETS[0].bg));
  const set = (f: string, b: string, quiet = false) => {
    setFg(f);
    setBg(b);
    setCaption(contrastCaption(f, b), { quiet });
  };
  const r = contrastRatio(fg, bg);
  const g = grade(r);
  const dL = deltaL({ fg, bg });
  const loaded = CONTRAST_PRESETS.find((p) => p.fg === fg && p.bg === bg)?.id ?? null;
  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="WCAG 2.x contrast" value={formatRatio(r)} color={g.aaNormal ? 'var(--ok)' : 'var(--bad)'} sub="(L1 + 0.05) / (L2 + 0.05)" />
          <Stat label="OKLCH ΔL" value={f3(dL)} sub="perceived lightness gap" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'passes' }, { color: 'var(--bad)', label: 'fails' }]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {CONTRAST_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={loaded === p.id} onClick={() => set(p.fg, p.bg)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <ColorField label="Text" value={fg} onChange={(v) => set(v, bg, true)} />
          <ColorField label="Background" value={bg} onChange={(v) => set(fg, v, true)} />
        </>,
      ]}
    >
      <div className="stage-pad cs-row">
        <div className="cs-preview" style={{ color: fg, background: bg }}>
          <p className="cs-preview-big">Large text, 24 px</p>
          <p>Body text at 16 px. Can you read this comfortably?</p>
        </div>
        <Box className="cs-grades">
          <SectionTitle hint="the same formula as the accessibility lesson">WCAG 2.x</SectionTitle>
          <ul>
            {GRADE_LABELS.map(({ key, label }) => (
              <li key={key} className={g[key] ? 'is-pass' : 'is-fail'}>
                <b>{g[key] ? 'pass' : 'fail'}</b> {label}
              </li>
            ))}
          </ul>
          <Hint block tone="muted">
            Related, not the same: "{GREY_PAIR.label}" and "{BLUE_PAIR.label}" have almost the same OKLCH ΔL ({f3(deltaL(GREY_PAIR))} and {f3(deltaL(BLUE_PAIR))}),
            but WCAG gives {formatRatio(contrastRatio(GREY_PAIR.fg, GREY_PAIR.bg))} and {formatRatio(contrastRatio(BLUE_PAIR.fg, BLUE_PAIR.bg))}: it compares luminance with a 0.05 flare term added to both sides,
            so a pair at the dark end scores lower than a pair at the light end with the same lightness gap. WCAG 2.x is what audits use. APCA, a newer method proposed for WCAG 3, isn't a finished standard yet.
          </Hint>
        </Box>
      </div>
    </StageFrame>
  );
}

