import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, PlotCursor, PointerLayer, Points, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { decimal, pct } from '../../core/format';
import { plainTone } from '../../core/tone';
import { harmonicsCaption } from './captions';
import {
  AMP_MAX, AMP_STEP, GIBBS_LIMIT, GIBBS_TERMS_MAX, HARMONICS, MAX_DRAWN, N, PHASE_MAX, PHASE_STEP, TARGETS, Y_LIMIT, addPoint, builtAt, builtSamples, harmonicAt,
  initialHarmonics, overshootShare, rmsError, snapToDft, squarePeak, targetSamples, type HarmonicsState, type TargetId,
} from './harmonics';

const ROWS = Array.from({ length: HARMONICS }, (_, k) => k);
const GIBBS_POINTS = Array.from({ length: GIBBS_TERMS_MAX }, (_, i) => [i + 1, squarePeak(i + 1)] as [number, number]);
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--dim)', label: 'the target', shape: 'line' },
      { color: 'var(--hi)', label: 'the sum of your harmonics', shape: 'line' },
      { color: 'var(--bad)', label: 'the error at each sample', shape: 'line' },
      { color: 'var(--amber)', label: 'harmonics 1 to 8 in turn (amber, pink, sky, orange)', shape: 'dot' },
    ]}
  />
);

export function HarmonicsScene({ picker }: { picker: ReactNode }) {
  const [h, setH] = useState<HarmonicsState>(initialHarmonics);
  const [cursor, setCursor] = useState<readonly [number, number]>([0.5, 0]);
  const [note, setNote] = useState<string | null>(null);
  const target = useMemo(() => targetSamples(h.target, h.drawn), [h.target, h.drawn]);
  const built = useMemo(() => builtSamples(h), [h]);
  const rms = rmsError(h);
  const peak = Math.max(...built);
  const drawn = h.target === 'drawn';
  const caption = harmonicsCaption(h);
  const targetLine: [number, number][] = [...target.map((v, n) => [n / N, v] as [number, number]), [1, target[0]]];
  const residuals = target.map((v, n) => ({ from: [n / N, v] as [number, number], to: [n / N, built[n]] as [number, number] }));
  const add = (p: readonly number[]) => {
    const r = addPoint(h.drawn, { x: p[0], y: p[1] });
    setNote(r.refusal);
    setH((c) => ({ ...c, drawn: r.points }));
  };
  const setAmp = (k: number, v: number) => setH((c) => ({ ...c, amps: c.amps.map((a, i) => (i === k ? v : a)) }));
  const setPhase = (k: number, v: number) => setH((c) => ({ ...c, phases: c.phases.map((a, i) => (i === k ? v : a)) }));
  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={caption}
      introKey={`${caption}|${note ?? ''}`}
      stats={
        <Stats>
          <Stat label="RMS error" value={decimal(rms, 2)} color={rms > 0.05 ? 'var(--bad)' : 'var(--ok)'} sub="at the 64 samples" />
          <Stat label="Peak of your sum" value={decimal(Math.max(peak, 0), 2)} sub={h.target === 'square' ? (overshootShare(peak) >= 0.001 ? `${pct(overshootShare(peak), 1)} of the jump above the plateau, at the 64 samples` : 'none above the plateau, at the 64 samples') : 'highest of the 64 samples'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Target waveform" value={h.target} onChange={(target: TargetId) => { setNote(null); setH((c) => ({ ...c, target })); }} options={[...TARGETS]} />
          <Toggle label="Phase" value={h.mode === 'free'} onChange={(on) => setH((c) => ({ ...c, mode: on ? 'free' : 'sine' }))} off="sine (phase 0)" on="free phase" />
        </>,
        <>
          <Button variant="primary" onClick={() => setH((c) => snapToDft(c))}>Snap to the DFT</Button>
          {drawn && <Button onClick={() => add(cursor)}>Add point at the cursor</Button>}
          {drawn && <Button softDisabled={h.drawn.length === 0} onClick={() => { setNote(null); setH((c) => ({ ...c, drawn: [] })); }}>Clear the curve</Button>}
          <Button onClick={() => { setNote(null); setCursor([0.5, 0]); setH(initialHarmonics()); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="ft-stage stage-pad">
        <div className="ft-row">
          <div className="ft-col">
            <Box>
              <SectionTitle hint={drawn ? `click to add a point (at most ${MAX_DRAWN})` : 'one period, 64 samples'}>The target and your sum</SectionTitle>
              <Plot2D x={{ domain: [0, 1], label: 'time (one period)' }} y={{ domain: [-Y_LIMIT, Y_LIMIT] }} ariaLabel="The target waveform, the sum of the harmonics and the error at each sample">
                {drawn && <PointerLayer onDown={(p) => add(p)} />}
                {/* The click layer is underneath: nothing drawn above it may take the pointer. */}
                <g pointerEvents="none">
                  <Curve points={targetLine} tone="dim" width={2} />
                  <Segments segments={residuals} tone="bad" />
                  {ROWS.map((k) => (h.amps[k] > 0 ? <Curve key={k} fn={(t) => harmonicAt(h, k, t)} tone={plainTone(k)} width={1} /> : null))}
                  <Curve fn={(t) => builtAt(h, t)} tone="hi" width={2.5} />
                  {drawn && <Points data={h.drawn.map((p) => ({ x: p.x, y: p.y, tone: 'dim' as const, r: 3 }))} />}
                </g>
                {drawn && <PlotCursor at={cursor} onMove={(p) => setCursor([p[0], p[1]])} label="Cursor for adding a point to the drawn curve" />}
              </Plot2D>
            </Box>
            {note && <p className="ft-note" role="status">{note}</p>}
          </div>
          {h.target === 'square' && (
            <div className="ft-col">
              <Box>
                <SectionTitle hint="the overshoot of a square wave does not shrink">Gibbs: the peak of the odd harmonics</SectionTitle>
                <Plot2D x={{ domain: [1, GIBBS_TERMS_MAX], label: 'odd harmonics added' }} y={{ domain: [1, 1.3], label: 'peak of the sum' }} height={200} ariaLabel="Peak of the partial sum of a square wave against the number of odd harmonics">
                  <Curve points={GIBBS_POINTS} tone="info" />
                  <HLine at={GIBBS_LIMIT} label={decimal(GIBBS_LIMIT, 3)} tone="dim" />
                </Plot2D>
              </Box>
            </div>
          )}
        </div>
        <Box>
          <SectionTitle hint="amplitude 0 to 1.5 of each harmonic; harmonic k fits k times into the period">Harmonics</SectionTitle>
          <div className="ft-sliders">
            {ROWS.map((k) => (
              <Slider key={k} label={`${k + 1}×`} value={h.amps[k]} min={0} max={AMP_MAX} step={AMP_STEP} format={(v) => decimal(v, 2)} onChange={(v) => setAmp(k, v)} />
            ))}
          </div>
          {h.mode === 'free' && (
            <div className="ft-sliders">
              {ROWS.map((k) => (
                <Slider key={k} label={`phase ${k + 1}×`} value={h.phases[k]} min={-PHASE_MAX} max={PHASE_MAX} step={PHASE_STEP} format={(v) => decimal(v, 2)} onChange={(v) => setPhase(k, v)} />
              ))}
            </div>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">the coefficients come from the lesson's own DFT of the target, not from a table</Provenance>
          <Provenance kind="illustrative">the target has 64 samples over one period; the square and sawtooth are 0 at their jumps</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

