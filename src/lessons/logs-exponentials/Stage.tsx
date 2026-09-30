import { useMemo, useState, type ReactNode } from 'react';
import { BitStrip, type BitGroup } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { toBits } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { superscript } from '../../core/format';
import { linearScale, logScale } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { halvingFrames } from './frames';
import {
  MAX_DOUBLINGS, REFERENCES, ceilLog2, decimalExponent, group, parseCount, pow2, referenceAtOrBelow, squares,
} from './model';
import './styles.css';

type Scene = 'doubling' | 'halving' | 'bits';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'doubling', label: 'Doubling' },
  { value: 'halving', label: 'Halving' },
  { value: 'bits', label: 'Bits needed' },
];
const HALVE_MS = 900;
const CHART = { width: 440, height: 230, left: 44, right: 400, top: 18, bottom: 200 };
const GRID_CELL = 8;
const GRID_GAP = 1;

/** base^k with a real <sup>: the mono font's Unicode superscript digits read badly. */
function Pow({ base = 2, k }: { base?: number; k: number }) {
  return (
    <>
      {base}
      <sup className="le-sup">{k}</sup>
    </>
  );
}

export function Stage() {
  const [scene, setScene] = useState<Scene>('doubling');
  const [n, setN] = useState(1_000_000);
  const picker = <Segmented label="Tool" options={SCENES} value={scene} onChange={setScene} />;
  const halveThis = (value: number) => {
    setN(value);
    setScene('halving');
  };
  if (scene === 'halving') return <HalvingScene picker={picker} n={n} setN={setN} />;
  if (scene === 'bits') return <BitsScene picker={picker} n={n} setN={setN} />;
  return <DoublingScene picker={picker} onHalve={halveThis} />;
}

// ── Doubling ─────────────────────────────────────────────────────────

function DoublingScene({ picker, onHalve }: { picker: ReactNode; onHalve: (n: number) => void }) {
  const [k, setK] = useState(10);
  const [axis, setAxis] = useState<'linear' | 'log'>('linear');
  const setCaption = useSetCaption();
  const value = pow2(k);
  const landmark = referenceAtOrBelow(k);

  useIntroCaption(
    <>Each step doubles the pile. Drag the slider: ten doublings is already about a thousand, forty is over a trillion.</>,
  );

  const change = (next: number) => {
    setK(next);
    const hit = REFERENCES.find((r) => r.k === next);
    setCaption(
      hit ? (
        <><Pow k={next} /> = <span className="hl">{group(pow2(next))}</span>: {hit.label}.</>
      ) : (
        <><Pow k={next} /> = <span className="hl">{group(pow2(next))}</span>, about <Pow base={10} k={Math.round(decimalExponent(next))} />.
          Every ten doublings add about three zeros.</>
      ),
      { quiet: true },
    );
  };

  const flip = (a: 'linear' | 'log') => {
    setAxis(a);
    setCaption(
      a === 'log' ? (
        <>On a <b>log</b> axis each step up is ×2, so 2ⁿ becomes a straight line and every landmark gets its own even step.</>
      ) : (
        <>On a <b>linear</b> axis 2ⁿ hugs zero, then shoots up at the very end: everything below 2³⁰ is squashed flat.</>
      ),
    );
  };

  return (
    <StageFrame
      height={300}
      minWidth={460}
      stats={
        <Stats>
          <Stat label={`2 to the ${k}`} value={group(value)} color="var(--hi)" />
          <Stat label="≈ decimal" value={<Pow base={10} k={Math.round(decimalExponent(k))} />} sub="every 10 doublings ≈ ×1,000" />
          <Stat label="Landmark" value={landmark ? <Pow k={landmark.k} /> : '–'} sub={landmark?.label ?? 'none yet'} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current power' },
            { color: 'color-mix(in srgb, var(--hi) 35%, transparent)', label: 'what you had before this doubling' },
            { color: 'var(--info)', label: 'real-world landmarks', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Doublings k" value={k} min={0} max={MAX_DOUBLINGS} onChange={change} />
          <Segmented label="Chart axis" value={axis} onChange={flip} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]} />
          <Button onClick={() => onHalve(value)}><span>Halve <Pow k={k} /> back to 1 →</span></Button>
        </>,
      ]}
    >
      <div className="stage-pad le">
        <SquareGrid k={k} />
        <PowerChart k={k} axis={axis} />
      </div>
    </StageFrame>
  );
}

/** 2^k squares, packed into a rectangle; the half added by the last doubling is brighter. */
function SquareGrid({ k }: { k: number }) {
  const { count, eachWorth } = squares(k);
  const j = Math.log2(count);
  const cols = 2 ** Math.ceil(j / 2);
  const rows = count / cols;
  const size = 32 * (GRID_CELL + GRID_GAP);
  // Up to 2^10 the newest half is brighter; past that every square doubled in worth, so they all are.
  const isNew = (col: number, row: number) => eachWorth > 1 || j === 0 || (j % 2 === 1 ? col >= cols / 2 : row >= rows / 2);
  return (
    <div className="le-grid-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="le-grid" role="img" aria-label={`${count} squares`}>
        {Array.from({ length: count }, (_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          return (
            <rect
              key={i}
              x={col * (GRID_CELL + GRID_GAP)}
              y={row * (GRID_CELL + GRID_GAP)}
              width={GRID_CELL}
              height={GRID_CELL}
              rx={1.5}
              className={isNew(col, row) ? 'le-sq is-new' : 'le-sq'}
            />
          );
        })}
      </svg>
      <p className="le-grid-note">
        {eachWorth === 1 ? (
          `${group(count)} ${count === 1 ? 'square' : 'squares'}`
        ) : (
          <>1,024 squares, each worth <Pow k={k - 10} /> = {group(eachWorth)}</>
        )}
      </p>
    </div>
  );
}

function PowerChart({ k, axis }: { k: number; axis: 'linear' | 'log' }) {
  const x = linearScale(0, MAX_DOUBLINGS, CHART.left, CHART.right);
  const top = pow2(MAX_DOUBLINGS);
  const y = axis === 'log' ? logScale(1, top, CHART.bottom, CHART.top, 2) : linearScale(0, top, CHART.bottom, CHART.top);
  const points = Array.from({ length: MAX_DOUBLINGS + 1 }, (_, i) => `${x.map(i)},${y.map(pow2(i))}`).join(' ');
  // On a linear axis the lower landmarks all sit on the floor: label only the ones with room.
  const labelled = REFERENCES.filter((r, i, all) => {
    const prev = all[i + 1];
    return !prev || Math.abs(y.map(pow2(r.k)) - y.map(pow2(prev.k))) > 11;
  });
  return (
    <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="le-chart" role="img" aria-label={`2 to the k, ${axis} axis`}>
      <line x1={CHART.left} y1={CHART.bottom} x2={CHART.right} y2={CHART.bottom} className="le-axis" />
      <line x1={CHART.left} y1={CHART.top} x2={CHART.left} y2={CHART.bottom} className="le-axis" />
      {REFERENCES.map((r) => (
        <line key={r.k} x1={CHART.left} x2={CHART.right} y1={y.map(pow2(r.k))} y2={y.map(pow2(r.k))} className="le-ref" />
      ))}
      {labelled.map((r) => (
        <text key={r.k} x={CHART.right + 4} y={y.map(pow2(r.k)) + 4} className="le-ref-label">
          2{superscript(r.k)}
        </text>
      ))}
      <polyline points={points} className="le-curve" />
      <line x1={x.map(k)} x2={x.map(k)} y1={CHART.top} y2={CHART.bottom} className="le-now-line" />
      <circle cx={x.map(k)} cy={y.map(pow2(k))} r={5.5} className="le-now" />
      {[0, 10, 20, 30, 40].map((t) => (
        <text key={t} x={x.map(t)} y={CHART.bottom + 16} textAnchor="middle" className="le-tick">
          {t}
        </text>
      ))}
      <text x={CHART.left - 8} y={CHART.top + 4} textAnchor="end" className="le-tick">2⁴⁰</text>
      <text x={CHART.left - 8} y={CHART.bottom + 4} textAnchor="end" className="le-tick">{axis === 'log' ? '1' : '0'}</text>
      <text x={(CHART.left + CHART.right) / 2} y={CHART.height - 2} textAnchor="middle" className="le-axis-label">
        doublings k · {axis} axis
      </text>
    </svg>
  );
}

// ── Halving ──────────────────────────────────────────────────────────

const HALVING_PRESETS = [1_000, 1_000_000, 1_000_000_000, pow2(40)];

function CountField({ n, setN, label }: { n: number; setN: (v: number) => void; label: string }) {
  const [text, setText] = useState(group(n));
  const [shownFor, setShownFor] = useState(n);
  if (shownFor !== n) {
    setShownFor(n);
    setText(group(n));
  }
  const parsed = parseCount(text);
  const apply = () => parsed !== null && setN(parsed);
  return (
    <>
      <TextField label={label} value={text} onChange={setText} onEnter={apply} width={170} spellCheck={false} />
      <Button onClick={apply} disabled={parsed === null || parsed === n}>Use it</Button>
      {parsed === null && <Hint className="le-error">A whole number from 1 to {group(pow2(40))} (commas or 1e6 are fine).</Hint>}
    </>
  );
}

function HalvingScene({ picker, n, setN }: { picker: ReactNode; n: number; setN: (v: number) => void }) {
  const { steps, frames } = useMemo(() => halvingFrames(n), [n]);
  const player = usePlayer(frames, { interval: HALVE_MS });
  const at = player.frame.at;
  const value = steps[at];
  const total = steps.length - 1;
  const linear = value / n;
  const log = n === 1 ? 0 : Math.log2(value) / Math.log2(n);

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Left" value={group(value)} color="var(--violet)" />
          <Stat label="Halvings" value={`${at} / ${total}`} color="var(--hi)" sub={`log₂ N ≈ ${Math.log2(n).toFixed(1)}, rounded up`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'halving steps' },
            { color: 'var(--hi)', label: 'where you are now' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <CountField n={n} setN={setN} label="Start with N" />
        </>,
        <ControlGroup key="presets" label="Try">
          {HALVING_PRESETS.map((p) => (
            <ChipButton key={p} size="md" on={p === n} onClick={() => setN(p)}>
              {p === pow2(40) ? '2⁴⁰' : group(p)}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad le-halve">
        <Box className="le-bars">
          <SectionTitle hint="how much is left">Linear scale</SectionTitle>
          <div className="le-bar"><i style={{ width: `${linear * 100}%` }} /></div>
          <SectionTitle hint="how many bits are left: each halving removes one">Log scale</SectionTitle>
          <div className="le-bar is-log"><i style={{ width: `${log * 100}%` }} /></div>
        </Box>
        <ol className="le-steps" aria-label="Halving steps">
          {steps.map((s, i) => (
            <li key={i} className={i === at ? 'is-now' : i < at ? 'is-done' : ''}>
              {group(s)}
            </li>
          ))}
        </ol>
      </div>
    </StageFrame>
  );
}

// ── Bits needed ──────────────────────────────────────────────────────

const BIT_PRESETS = [1, 2, 3, 4, 50, 1023, 1024, 1025, 1_000_000];

/** Byte brackets counted from the least significant bit, so a 10-bit number reads 2 + 8, not 8 + 2. */
function bytesFromRight(width: number): BitGroup[] {
  const groups: BitGroup[] = [];
  for (let to = width - 1; to >= 0; to -= 8) groups.unshift({ from: Math.max(0, to - 7), to, tone: 'violet' });
  return groups;
}

function BitsScene({ picker, n, setN }: { picker: ReactNode; n: number; setN: (v: number) => void }) {
  const bits = ceilLog2(n);
  const width = Math.max(1, bits);
  const setCaption = useSetCaption();

  useIntroCaption(
    <>To give {group(n)} things different codes you need <b>{bits} bits</b>: numbering them 0 to {group(n - 1)}, the last code
      is the widest.</>,
  );

  const choose = (v: number) => {
    setN(v);
    setCaption(
      v === 1 ? (
        <>One thing needs <b>0 bits</b>: there's nothing to tell apart.</>
      ) : (
        <>{group(v)} things need log₂ {group(v)} rounded up = <span className="hl">{ceilLog2(v)} bits</span>.{' '}
          {pow2(ceilLog2(v)) === v ? 'A power of two fits exactly: one more thing would need another bit.' : 'Going past a power of two costs one more bit.'}</>
      ),
    );
  };

  return (
    <StageFrame
      height={260}
      stats={
        <Stats>
          <Stat label="Things" value={group(n)} color="var(--violet)" />
          <Stat label="Bits needed" value={bits} color="var(--hi)" sub="log₂ N, rounded up" />
          <Stat label="Room for" value={group(pow2(bits))} sub={<><Pow k={bits} /> codes</>} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit = 1' },
            { color: 'var(--dim)', label: 'bit = 0' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <CountField n={n} setN={choose} label="Number of things N" />
          <Button onClick={() => choose(Math.min(n + 1, pow2(40)))}>One more (N + 1)</Button>
        </>,
        <ControlGroup key="presets" label="Boundaries">
          {BIT_PRESETS.map((p) => (
            <ChipButton key={p} on={p === n} onClick={() => choose(p)}>
              {group(p)}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad le-bits">
        <SectionTitle hint={`the biggest code, ${group(n - 1)}, in binary`}>The last code</SectionTitle>
        <BitStrip
          bits={toBits(n - 1, width)}
          groups={width > 8 ? bytesFromRight(width) : []}
          toneOf={(_, bit) => (bit ? 'hi' : 'dim')}
          placeValues={width > 16 ? 'exponent' : true}
          size={width > 24 ? 'sm' : 'md'}
          ariaLabel={`${width} bits`}
        />
        <p className="le-range">
          {bits === 0
            ? '1 thing: nothing to tell apart, so no bits at all.'
            : <><Pow k={bits - 1} /> = {group(pow2(bits - 1))} &lt; {group(n)} ≤ <Pow k={bits} /> = {group(pow2(bits))}</>}
        </p>
      </div>
    </StageFrame>
  );
}
