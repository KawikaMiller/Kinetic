import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import {
  A_MAX, A_MIN, B_MAX, B_MIN, DEFAULT_REAL, REAL_X, REAL_Y, SINGULAR_REFUSAL, discriminant, integerPoints, isSingularReal, realAdd, realNeg, realOrder, REAL_ORDER_LIMIT,
  realPointFloat, realPointText, realWorkingText, type RealCurve, type RealPoint,
} from './model';

const PRESETS: { label: string; curve: RealCurve }[] = [
  { label: 'a = -2, b = 1', curve: DEFAULT_REAL },
  { label: 'a = -1, b = 0', curve: { a: -1, b: 0 } },
  { label: 'a = 0, b = 0 (sharp point)', curve: { a: 0, b: 0 } },
  { label: 'a = -3, b = 2 (sharp point)', curve: { a: -3, b: 2 } },
];
const PLOT_W = 356;
const PLOT_H = 280;
const DEFAULT_KEYS = { p: '0,1', q: '1,0' };

const keyOf = (P: RealPoint) => `${P.x.n}/${P.x.d},${P.y.n}/${P.y.d}`;
const simpleKey = (P: RealPoint) => `${P.x.n},${P.y.n}`;
const pick = (key: string, pts: readonly RealPoint[], fallback: number): RealPoint | null => pts.find((P) => simpleKey(P) === key) ?? pts[fallback] ?? pts[0] ?? null;

/** Scene 1: chord and tangent on the real plane, with the points chosen among the curve's integer points so every shown number is an exact fraction. */
export function RealScene({ picker }: { picker: ReactNode }) {
  const [curve, setCurve] = useState<RealCurve>(DEFAULT_REAL);
  const [keys, setKeys] = useState(DEFAULT_KEYS);
  const singular = isSingularReal(curve);
  const pts = useMemo(() => (singular ? [] : integerPoints(curve)), [curve, singular]);
  const P = pick(keys.p, pts, 1);
  const Q = pick(keys.q, pts, 2);
  const sum = P && Q ? realAdd(curve, P, Q) : null;
  const R = sum?.result ?? null;
  const third = R ? realNeg(R) : null;
  const slopeFloat = sum?.slope ? Number(sum.slope.n) / Number(sum.slope.d) : null;
  const order = P ? realOrder(curve, P) : null;

  const snap = (set: (k: string) => void) => (_i: number, at: readonly [number, number]) => {
    let best: RealPoint | null = null;
    let bestD = Infinity;
    for (const c of pts) {
      const [x, y] = realPointFloat(c);
      const d = (x - at[0]) ** 2 + (y - at[1]) ** 2;
      if (d < bestD) [best, bestD] = [c, d];
    }
    if (best) set(simpleKey(best));
  };

  const intro = singular ? SINGULAR_REFUSAL : P && Q ? realWorkingText(curve, P, Q) : 'This curve has fewer than one integer point in the window: pick another curve.';
  const f = (x: number) => x ** 3 + curve.a * x + curve.b;
  // labels go to the side away from the other points, so close points do not print on top of each other
  const px = P ? realPointFloat(P)[0] : 0;
  const qx = Q ? realPointFloat(Q)[0] : 0;
  const rx = R ? realPointFloat(R)[0] : 0;
  const ends = { pLeft: px < qx, qLeft: qx < px, sumLeft: rx < Math.max(px, qx) };

  return (
    <StageFrame
      height={PLOT_H + 40}
      intro={intro}
      introKey={`real|${curve.a}|${curve.b}|${P ? keyOf(P) : '-'}|${Q ? keyOf(Q) : '-'}`}
      stats={
        <Stats>
          <Stat label="4a^3 + 27b^2" value={discriminant(curve)} color={singular ? 'var(--bad)' : undefined} sub={singular ? 'zero: refused' : 'not zero: a real elliptic curve'} />
          <Stat label="P + Q" value={singular || !sum ? '–' : realPointText(R)} color={R === null && sum ? 'var(--hi)' : 'var(--ok)'} sub={sum && R === null ? 'the point at infinity O, the identity' : 'exact fractions'} />
          <Stat label="Order of P" value={order === null ? 'not found' : order} sub={order === null ? `no multiple up to ${REAL_ORDER_LIMIT + 1} is O: a rational point can have infinite order` : 'the smallest m with mP = O'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'P', shape: 'dot' },
            { color: 'var(--violet)', label: 'Q', shape: 'dot' },
            { color: 'var(--ok)', label: 'P + Q', shape: 'dot' },
            { color: 'var(--dim)', label: 'the line and the third intersection', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="a" value={curve.a} min={A_MIN} max={A_MAX} onChange={(a) => setCurve({ ...curve, a })} />
          <Slider label="b" value={curve.b} min={B_MIN} max={B_MAX} onChange={(b) => setCurve({ ...curve, b })} />
        </>,
        <>
          <ControlGroup label="Curve">
            {PRESETS.map((pr) => (
              <ChipButton key={pr.label} on={pr.curve.a === curve.a && pr.curve.b === curve.b} onClick={() => { setCurve(pr.curve); setKeys(DEFAULT_KEYS); }}>
                {pr.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <ControlGroup label="P">
            {pts.map((c) => (
              <ChipButton key={`p${keyOf(c)}`} tone="info" on={P !== null && keyOf(c) === keyOf(P)} onClick={() => setKeys({ ...keys, p: simpleKey(c) })}>
                {realPointText(c)}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Q">
            {pts.map((c) => (
              <ChipButton key={`q${keyOf(c)}`} tone="violet" on={Q !== null && keyOf(c) === keyOf(Q)} onClick={() => setKeys({ ...keys, q: simpleKey(c) })}>
                {realPointText(c)}
              </ChipButton>
            ))}
          </ControlGroup>
          {singular && <Hint tone="bad">{SINGULAR_REFUSAL}. Showing the curve greyed out.</Hint>}
          {!singular && pts.length === 0 && <Hint tone="muted">No integer points inside the window: choose another curve.</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad ec-stage">
        <Plot2D
          x={{ domain: REAL_X, label: 'x' }}
          y={{ domain: REAL_Y, label: 'y' }}
          width={PLOT_W}
          height={PLOT_H}
          ariaLabel={`The curve y^2 = x^3 + ${curve.a}x + ${curve.b}${P && Q ? `, with P = ${realPointText(P)}, Q = ${realPointText(Q)} and their sum` : ''}`}
        >
          <Curve fn={(x) => Math.sqrt(f(x))} tone={singular ? 'dim' : 'muted'} dashed={singular} />
          <Curve fn={(x) => -Math.sqrt(f(x))} tone={singular ? 'dim' : 'muted'} dashed={singular} />
          {sum && P && Q && slopeFloat !== null && <Curve fn={(x) => realPointFloat(P)[1] + slopeFloat * (x - realPointFloat(P)[0])} tone="dim" dashed />}
          {sum && P && Q && slopeFloat === null && sum.rule !== 'identity-left' && sum.rule !== 'identity-right' && (
            <Segments segments={[{ from: [realPointFloat(P)[0], REAL_Y[0]], to: [realPointFloat(P)[0], REAL_Y[1]] }]} tone="dim" dashed />
          )}
          {R && third && <Segments segments={[{ from: realPointFloat(R), to: realPointFloat(third) }]} tone="dim" dashed />}
          {third && <Points data={[{ x: realPointFloat(third)[0], y: realPointFloat(third)[1] }]} tone="dim" hollow />}
          {pts.length > 0 && <Points data={pts.map((c) => ({ x: realPointFloat(c)[0], y: realPointFloat(c)[1], tone: 'muted' as const, hollow: true, r: 3 }))} />}
          {R && <Points data={[{ x: realPointFloat(R)[0], y: realPointFloat(R)[1] }]} tone="ok" labels={() => ({ text: 'P + Q', left: ends.sumLeft })} />}
          {Q && <Points data={[{ x: realPointFloat(Q)[0], y: realPointFloat(Q)[1] }]} tone="violet" labels={() => ({ text: 'Q', left: ends.qLeft })} onDrag={snap((k) => setKeys({ ...keys, q: k }))} pointLabel={() => 'Q, drag along the curve'} />}
          {P && <Points data={[{ x: realPointFloat(P)[0], y: realPointFloat(P)[1] }]} tone="info" labels={() => ({ text: 'P', left: ends.pLeft })} onDrag={snap((k) => setKeys({ ...keys, p: k }))} pointLabel={() => 'P, drag along the curve'} />}
        </Plot2D>
        <p className="ec-note">
          The drawing is a float rendering; every number above and in the caption is an exact fraction from the group-law code. P and Q snap to the curve's points with whole-number coordinates inside the window, so the page can stay exact. The two axes use different scales (y is squeezed about {Math.round((PLOT_W / (REAL_X[1] - REAL_X[0])) / (PLOT_H / (REAL_Y[1] - REAL_Y[0])))} to 1), so slopes look flatter than their stated values. Drag a point, press a chip, or use the arrow keys on a focused point.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="illustrative">the picture is a float rendering of exact fractions; no finite field and no key here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
