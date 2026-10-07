import { useEffect, useState } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { pct, plural } from '../../core/format';
import type { Tone } from '../../core/tone';
import { fmtSpeed, viewCaption, type Law } from './frames';
import { CORE_STEPS, MAX_CORES, PRESETS, amdahl, bestWholeCores, ceiling, gustafson, runTime, withOverhead } from './model';
import './styles.css';

/** Lanes drawn one by one; the rest are summarised. */
const MAX_LANES = 8;
/** Coordination cost slider: 0 to this, per extra core (illustrative). */
const MAX_OVERHEAD = 0.002;
const OVERHEAD_STEP = 0.0001;
const WORKED_S = 0.2;
const Y_DOMAIN: [number, number] = [0.5, MAX_CORES];
const TICKS = [1, 4, 16, 64, 256];
/**
 * Preset overlays: category hues that mean nothing else here (orange is the serial part,
 * red the overhead). They hide while the overhead curve shows, so pink never sits by red.
 */
const PRESET_TONE: Tone[] = ['sky', 'violet', 'amber', 'pink'];

const law = (l: Law) => (l === 'amdahl' ? amdahl : gustafson);

function JobBars({ mode, s, n, c }: { mode: Law; s: number; n: number; c: number }) {
  const lanes = Math.min(n, MAX_LANES);
  if (mode === 'gustafson') {
    const oneCore = s + (1 - s) * n;
    return (
      <div className="ah-bars">
        <SectionTitle hint="fixed time, the work grows">{plural(n, 'core')}</SectionTitle>
        <div className="ah-track" style={{ height: lanes * 12 + (lanes - 1) * 3 }}>
          <span className="ah-seg is-serial" style={{ left: 0, width: `${s * 100}%`, top: 0, bottom: 0 }} />
          {Array.from({ length: lanes }, (_, i) => (
            <span key={i} className="ah-seg is-parallel" style={{ left: `${s * 100}%`, width: `${(1 - s) * 100}%`, top: i * 15, height: 12 }} />
          ))}
        </div>
        <p className="ah-note">
          {n > MAX_LANES && <>+ {n - MAX_LANES} more lanes like these. </>}
          One core would need {fmtSpeed(oneCore).replace('×', '')} times as long for the same work (not drawn to scale).
        </p>
      </div>
    );
  }
  const total = runTime(s, n, c);
  const scale = Math.max(1, total);
  const w = (x: number) => `${(x / scale) * 100}%`;
  const lane = (1 - s) / n;
  return (
    <div className="ah-bars">
      <SectionTitle hint="the same job, to scale">1 core</SectionTitle>
      <div className="ah-track" style={{ height: 12 }}>
        <span className="ah-seg is-serial" style={{ left: 0, width: w(s), top: 0, bottom: 0 }} />
        <span className="ah-seg is-parallel" style={{ left: w(s), width: w(1 - s), top: 0, bottom: 0 }} />
      </div>
      <SectionTitle hint={`${pct(total / 1, 1)} of the 1-core time`}>{plural(n, 'core')}</SectionTitle>
      <div className="ah-track" style={{ height: lanes * 12 + (lanes - 1) * 3 }}>
        <span className="ah-seg is-serial" style={{ left: 0, width: w(s), top: 0, bottom: 0 }} />
        {Array.from({ length: lanes }, (_, i) => (
          <span key={i} className="ah-seg is-parallel" style={{ left: w(s), width: w(lane), top: i * 15, height: 12 }} />
        ))}
        {c > 0 && n > 1 && <span className="ah-seg is-overhead" style={{ left: w(s + lane), width: w(c * (n - 1)), top: 0, bottom: 0 }} />}
      </div>
      {n > MAX_LANES && <p className="ah-note">+ {n - MAX_LANES} more lanes of the same length, side by side.</p>}
    </div>
  );
}

export function Stage() {
  const [mode, setMode] = useState<Law>('amdahl');
  const [s, setS] = useState(0.05);
  const [coreIndex, setCoreIndex] = useState(5);
  const [c, setC] = useState(0);
  const setCaption = useSetCaption();
  const n = CORE_STEPS[coreIndex];
  const overhead = mode === 'amdahl' ? c : 0;

  useEffect(() => {
    setCaption(viewCaption({ law: mode, s, n, c: overhead }), { quiet: true });
  }, [setCaption, mode, s, n, overhead]);

  const f = law(mode);
  const speed = overhead > 0 ? withOverhead(s, n, overhead) : f(s, n);
  const best = overhead > 0 ? bestWholeCores(s, overhead, MAX_CORES) : null;
  const cap = ceiling(s);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label={mode === 'amdahl' ? 'Speedup' : 'Scaled speedup'} value={fmtSpeed(speed)} color="var(--hi)" sub={`on ${plural(n, 'core')}`} />
          {mode === 'amdahl' && <Stat label="Ceiling 1 / s" value={Number.isFinite(cap) ? fmtSpeed(cap) : 'none'} color="var(--muted)" sub="however many cores" />}
          {mode === 'amdahl' && <Stat label="Run time" value={pct(runTime(s, n, overhead), 1)} color="var(--muted)" sub="of the 1-core time" />}
          {best !== null && <Stat label="Best core count" value={best} color="var(--ok)" sub={fmtSpeed(withOverhead(s, best, overhead))} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'serial part', shape: 'square' },
            { color: 'var(--info)', label: 'parallel lanes · this s', shape: 'square' },
            ...(overhead > 0 ? [{ color: 'var(--bad)', label: 'coordination overhead', shape: 'square' as const }] : []),
            { color: 'var(--hi)', label: 'current point', shape: 'dot' },
            { color: 'var(--muted)', label: 'perfect: n×', shape: 'line' },
            ...(mode === 'amdahl' && Number.isFinite(cap) && cap <= MAX_CORES ? [{ color: 'var(--dim)', label: 'ceiling 1 / s', shape: 'line' as const }] : []),
            ...(best !== null ? [{ color: 'var(--ok)', label: 'best core count', shape: 'line' as const }] : []),
            ...(overhead > 0 ? [] : PRESETS.map((p, i) => ({ color: `var(--${PRESET_TONE[i]})`, label: `s = ${pct(p)}`, shape: 'line' as const }))),
          ]}
        />
      }
      controls={[
        <>
          <Segmented
            label="Law"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'amdahl', label: "Amdahl (fixed job)" },
              { value: 'gustafson', label: "Gustafson (job grows)" },
            ]}
          />
          <ControlGroup label="Serial fraction presets">
            {PRESETS.map((p, i) => (
              <ChipButton key={p} tone={PRESET_TONE[i]} on={s === p} onClick={() => setS(p)}>
                {pct(p)}
              </ChipButton>
            ))}
            <ChipButton tone="orange" on={s === WORKED_S} onClick={() => setS(WORKED_S)}>
              Build: {pct(WORKED_S)} linking
            </ChipButton>
          </ControlGroup>
        </>,
        <>
          <Slider label="Serial fraction s" value={Math.round(s * 100)} min={0} max={95} onChange={(v) => setS(v / 100)} format={(v) => `${v}%`} />
          <Slider label="Cores" value={coreIndex} min={0} max={CORE_STEPS.length - 1} onChange={setCoreIndex} format={(i) => String(CORE_STEPS[i])} />
          {mode === 'amdahl' && (
            <Slider
              label="Overhead per extra core"
              value={Math.round(c / OVERHEAD_STEP)}
              min={0}
              max={MAX_OVERHEAD / OVERHEAD_STEP}
              onChange={(v) => setC(v * OVERHEAD_STEP)}
              format={(v) => (v === 0 ? 'none' : pct(v * OVERHEAD_STEP, 2))}
            />
          )}
        </>,
      ]}
    >
      <div className="ah stage-pad">
        <JobBars mode={mode} s={s} n={n} c={overhead} />
        <div className="ah-plot">
          <Plot2D
            x={{ domain: [1, MAX_CORES], log: true, label: 'cores (log)', tickValues: TICKS }}
            y={{ domain: Y_DOMAIN, log: true, label: mode === 'amdahl' ? 'speedup (log)' : 'scaled speedup (log)', tickValues: TICKS }}
            height={260}
            ariaLabel={`${mode === 'amdahl' ? 'Speedup' : 'Scaled speedup'} against cores, log scales`}
          >
            <Curve fn={(x) => x} tone="muted" dashed />
            {overhead === 0 && PRESETS.map((p, i) => <Curve key={p} fn={(x) => f(p, x)} tone={PRESET_TONE[i]} dashed width={1.5} />)}
            {mode === 'amdahl' && Number.isFinite(cap) && cap <= MAX_CORES && <HLine at={cap} label={`1 / s = ${fmtSpeed(cap)}`} tone="dim" />}
            <Curve fn={(x) => f(s, x)} tone="info" width={3} />
            {overhead > 0 && <Curve fn={(x) => withOverhead(s, x, overhead)} tone="bad" width={2.5} />}
            {best !== null && <VLine at={best} label={`best: ${best}`} tone="ok" />}
            <Points data={[{ x: n, y: speed, tone: 'hi' }]} r={6} />
          </Plot2D>
        </div>
        <Hint block>
          Computed from the formulas, not measured: an idealised model where the parallel part splits perfectly.{' '}
          {mode === 'amdahl' ? (
            <>
              The overhead term, a cost per extra core, is an illustrative stand-in for contention and coordination, not a real measurement. Amdahl:
              speedup = 1 / (s + (1 − s) / n).
            </>
          ) : (
            <>Gustafson: scaled speedup = s + (1 − s) · n.</>
          )}
        </Hint>
      </div>
    </StageFrame>
  );
}
