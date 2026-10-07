import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { radioKeyTarget } from '../../core/radio';
import { useMeasure } from '../../core/useMeasure';
import { fitFormula, fittsCaption, hickCaption, ms, r2Text } from './frames';
import {
  FITTS_TRIALS, HICK_TRIALS, LAYOUTS, WCAG_MIN_TARGET, choiceBits, fitTrials, fittsSchedule, hickSchedule, layoutId, predict, syntheticFitts, syntheticHick,
  type Fit, type FittsTrial, type Input, type Trial,
} from './model';
import './styles.css';

type Scene = 'fitts' | 'hick';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'fitts', label: 'Fitts: pointing' },
  { value: 'hick', label: 'Hick: choosing' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Game', options: SCENES, initial: 'fitts' });
  return scene === 'fitts' ? <FittsScene picker={picker} /> : <HickScene picker={picker} />;
}

const PLOT_W = 356;
const PLOT_H = 250;
const TIME_CAP = 2500;
const SYNTH_FITTS = syntheticFitts();
const SYNTH_HICK = syntheticHick();
const SYNTH_FITTS_FIT = fitTrials(SYNTH_FITTS);
const SYNTH_HICK_FIT = fitTrials(SYNTH_HICK);
const MISS_FLASH_MS = 350;
/** The trial clock. Only ever read in event handlers (oxlint's purity rule can't tell a handler inside a map from render). */
const clock = () => performance.now();

/** How the click was made: Enter/Space on a button reports detail 0. */
const inputOf = (e: MouseEvent, lastPointer: string | null): Input =>
  e.detail === 0 ? 'keyboard' : lastPointer === 'touch' || lastPointer === 'pen' ? lastPointer : 'mouse';

/** Trials (own: blue, synthetic: grey) and the fitted line in green. */
function TimePlot({ own, synth, fit, xLabel, xMax, ariaLabel }: {
  own: readonly Trial[];
  synth: readonly Trial[];
  fit: Fit;
  xLabel: string;
  xMax: number;
  ariaLabel: string;
}) {
  const valid = own.filter((t) => !t.miss && t.ms !== null);
  const top = Math.min(TIME_CAP, Math.max(1500, ...[...valid, ...synth].map((t) => t.ms ?? 0)) * 1.1);
  return (
    <Plot2D x={{ domain: [0, xMax], label: xLabel }} y={{ domain: [0, top], label: 'time (ms)' }} width={PLOT_W} height={PLOT_H} className="ul-plot" ariaLabel={ariaLabel}>
      <Points data={synth.map((t) => ({ x: t.bits, y: Math.min(top, t.ms!), tone: 'dim' }))} r={3} />
      {fit.ok && <Curve fn={(x) => predict(fit, x)} tone="ok" />}
      <Points data={valid.map((t) => ({ x: t.bits, y: Math.min(top, t.ms!), tone: 'info' }))} r={3.8} />
    </Plot2D>
  );
}

// ── Fitts ────────────────────────────────────────────────────────────

type Phase = 'idle' | 'armed' | 'moving' | 'done';
const ARENA_MIN = 280;
const START_D = 26;

function FittsScene({ picker }: { picker: ReactNode }) {
  const arena = useRef<HTMLDivElement>(null);
  const measured = useMeasure(arena, (el) => el.clientWidth);
  const [seed, setSeed] = useState(1);
  const [width, setWidth] = useState<number | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [missFlash, setMissFlash] = useState(0);
  const t0 = useRef(0);
  const lastPointer = useRef<string | null>(null);
  // Button takes no ref (Phase 2 request), so focus goes through a display: contents wrapper.
  const startBtn = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLButtonElement>(null);
  const setCaption = useSetCaption();
  const schedule = useMemo(() => (width ? fittsSchedule(seed, width) : []), [seed, width]);
  const current: FittsTrial | undefined = schedule[trials.length];
  const fit = useMemo(() => fitTrials(trials), [trials]);
  const shown = fit.ok ? fit : SYNTH_FITTS_FIT;
  const whose = fit.ok ? 'your fit' : 'the synthetic participant';
  // Predictions only make sense from a line that rises with difficulty.
  const usable = fit.ok && fit.b > 0;
  const forDesign = usable ? fit : SYNTH_FITTS_FIT;
  const designWhose = usable ? 'your fit' : fit.ok ? "the synthetic participant (your slope isn't positive yet)" : 'the synthetic participant';

  useEffect(() => {
    setCaption(fittsCaption(trials, fit));
  }, [trials, fit, setCaption]);

  // Keyboard focus follows the game: dot, then target, then the next dot; Start again at the end
  // (the dot disables itself and the arena's buttons unmount, which would drop focus to <body>).
  useEffect(() => {
    if (phase === 'armed') dotRef.current?.focus();
    else if (phase === 'moving') targetRef.current?.focus();
    else if (phase === 'done') startBtn.current?.querySelector('button')?.focus();
  }, [phase, trials.length]);

  useEffect(() => {
    if (!missFlash) return;
    const t = setTimeout(() => setMissFlash(0), MISS_FLASH_MS);
    return () => clearTimeout(t);
  }, [missFlash]);

  const start = () => {
    setWidth(Math.max(ARENA_MIN, measured ?? ARENA_MIN));
    setTrials([]);
    setPhase('armed');
  };
  const record = (t: Trial) => {
    const next = [...trials, t];
    setTrials(next);
    setPhase(next.length >= FITTS_TRIALS ? 'done' : 'armed');
  };
  const onStartDot = (e: MouseEvent) => {
    e.stopPropagation();
    t0.current = clock();
    setPhase('moving');
  };
  const onTarget = (e: MouseEvent) => {
    e.stopPropagation();
    if (phase !== 'moving' || !current) return;
    record({ bits: current.id, ms: clock() - t0.current, input: inputOf(e, lastPointer.current), miss: false });
  };
  const onArena = (e: MouseEvent) => {
    if (phase !== 'moving' || !current) return;
    setMissFlash((n) => n + 1);
    record({ bits: current.id, ms: null, input: inputOf(e, lastPointer.current), miss: true });
  };

  const valid = trials.filter((t) => !t.miss).length;
  const preds = LAYOUTS.map((l) => ({ l, id: layoutId(l), t: forDesign.ok ? predict(forDesign, layoutId(l)) : 0 }));
  const slowest = Math.max(1, ...preds.map((p) => p.t));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Trials" value={`${trials.length} of ${FITTS_TRIALS}`} color="var(--hi)" />
          <Stat label="Mis-clicks" value={trials.length - valid} sub="left out of the fit" />
          <Stat label="Fit" value={fit.ok ? fitFormula(fit, 'ID') : fit.reason} color={fit.ok ? 'var(--ok)' : undefined} sub={fit.ok ? r2Text(fit.r2) : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'start dot; your trials', shape: 'dot' },
            { color: 'var(--hi)', label: 'current target', shape: 'square' },
            { color: 'var(--ok)', label: `fitted line (${whose})`, shape: 'line' },
            { color: 'var(--dim)', label: 'synthetic participant', shape: 'dot' },
            { color: 'var(--bad)', label: 'mis-click flash', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <span ref={startBtn} className="ul-btn-wrap"><Button variant="primary" onClick={start}>{phase === 'idle' ? 'Start' : 'Start over'}</Button></span>
          <Button onClick={() => { setSeed(seed + 1); setTrials([]); setPhase('idle'); }}>New schedule</Button>
        </>,
      ]}
    >
      <div className="stage-pad ul-col">
        <div
          ref={arena}
          className={`ul-arena ${missFlash ? 'is-miss' : ''}`}
          onClick={onArena}
          onPointerDownCapture={(e) => { lastPointer.current = e.pointerType; }}
          role="group"
          aria-label="Fitts arena"
        >
          {phase === 'idle' && <p className="ul-arena-note">Press Start. Then click the blue dot, and the yellow target as fast as you can.</p>}
          {phase === 'done' && <p className="ul-arena-note">All {FITTS_TRIALS} trials done. Press Start over for another run.</p>}
          {current && (phase === 'armed' || phase === 'moving') && (
            <>
              <button
                ref={dotRef}
                type="button"
                className={`ul-start ${phase === 'moving' ? 'is-used' : ''}`}
                style={{ left: current.start - START_D / 2, width: START_D, height: START_D }}
                onClick={onStartDot}
                disabled={phase === 'moving'}
                aria-label={`Start trial ${trials.length + 1}`}
              />
              <button
                ref={targetRef}
                type="button"
                className={`ul-target ${phase === 'moving' ? 'is-live' : ''}`}
                style={{ left: current.target - current.width / 2, width: current.width }}
                onClick={onTarget}
                aria-label={`Target, ${current.width} pixels wide, ${current.distance} pixels away`}
              />
            </>
          )}
        </div>
        <Hint block>
          Distances are scaled to this arena&apos;s width ({width ?? measured ?? '–'} px) and widths run from 12 to 48 px. Each point is one trial at its index of difficulty
          ID = log₂(D/W + 1). Clicking anywhere else in the arena after the dot is a mis-click.
        </Hint>
        <div className="ul-row">
          <TimePlot own={trials} synth={SYNTH_FITTS} fit={shown} xLabel="index of difficulty ID (bits)" xMax={6.5} ariaLabel={`Movement time against ID: ${valid} of your trials`} />
          <Box className="ul-design">
            <SectionTitle hint={`predicted from ${designWhose}`}>The same toolbar, three ways</SectionTitle>
            <ul className="ul-layouts">
              {preds.map(({ l, id, t }) => (
                <li key={l.id}>
                  <span className="ul-layout-name">{l.label}</span>
                  <span className="ul-layout-geo">{l.edge ? `edge, ${l.distance} px away: width unbounded, ID → 0` : `${l.width} px button, ${l.distance} px away: ID ${id.toFixed(2)}`}</span>
                  <Bar value={t} max={slowest} tone={l.edge ? 'ok' : 'info'} trailing={ms(t)} />
                </li>
              ))}
            </ul>
            <Hint block>
              A screen edge stops a mouse pointer, so a target pinned there is effectively infinitely wide along the movement; the law&apos;s limit is the intercept a, and real
              users still need a moment to settle. On touch screens there&apos;s no edge to stop a finger. Constants a and b differ by person, device and task; the synthetic
              participant&apos;s ({SYNTH_FITTS_FIT.ok ? fitFormula(SYNTH_FITTS_FIT, 'ID') : '–'}) are illustrative.
            </Hint>
          </Box>
        </div>
        <Hint block className="ul-honest">
          Your own clicks, timed by the browser (± a few ms). With a keyboard or touch, the law changes, and so will your fit. The grey participant is synthetic. Touch
          targets: WCAG 2.2 asks for at least {WCAG_MIN_TARGET} × {WCAG_MIN_TARGET} CSS px (level AA), and Apple and Google guidelines suggest 44 pt and 48 dp; see
          the Responsive Design lesson for layouts that grow targets on phones.
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Hick ─────────────────────────────────────────────────────────────

function HickScene({ picker }: { picker: ReactNode }) {
  const [alphabetical, setAlphabetical] = useState(false);
  const [seed, setSeed] = useState(1);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [open, setOpen] = useState(false);
  const [focusAt, setFocusAt] = useState(0);
  const t0 = useRef(0);
  const lastPointer = useRef<string | null>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const nextBtn = useRef<HTMLSpanElement>(null);
  const picked = useRef(false);
  const setCaption = useSetCaption();
  const schedule = useMemo(() => hickSchedule(seed, alphabetical), [seed, alphabetical]);
  const round = schedule[trials.length];
  const fit = useMemo(() => fitTrials(trials), [trials]);
  const shown = fit.ok ? fit : SYNTH_HICK_FIT;

  useEffect(() => {
    setCaption(hickCaption(trials, fit, alphabetical));
  }, [trials, fit, alphabetical, setCaption]);

  // Focus follows the menu: into it when it opens, back to the round button when a pick closes it.
  useEffect(() => {
    if (open) items.current[0]?.focus();
    else if (picked.current) {
      picked.current = false;
      nextBtn.current?.querySelector('button')?.focus();
    }
  }, [open]);

  const reset = (patch: { alphabetical?: boolean; seed?: number }) => {
    if (patch.alphabetical !== undefined) setAlphabetical(patch.alphabetical);
    if (patch.seed !== undefined) setSeed(patch.seed);
    setTrials([]);
    setOpen(false);
  };
  const next = () => {
    setOpen(true);
    setFocusAt(0);
    t0.current = clock();
  };
  const choose = (e: MouseEvent, item: string) => {
    const now = clock();
    if (!round) return;
    const hit = item === round.target;
    setTrials([...trials, { bits: choiceBits(round.n), ms: hit ? now - t0.current : null, input: inputOf(e, lastPointer.current), miss: !hit }]);
    picked.current = true;
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (!round) return;
    const to = radioKeyTarget(e.key, i, round.items.length);
    if (to === null) return;
    e.preventDefault();
    setFocusAt(to);
    items.current[to]?.focus();
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Rounds" value={`${trials.length} of ${HICK_TRIALS}`} color="var(--hi)" />
          <Stat label="Wrong picks" value={trials.filter((t) => t.miss).length} sub="left out of the fit" />
          <Stat label="Fit" value={fit.ok ? fitFormula(fit, 'log₂(n+1)') : fit.reason} color={fit.ok ? 'var(--ok)' : undefined} sub={fit.ok ? r2Text(fit.r2) : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the item to click', shape: 'square' },
            { color: 'var(--info)', label: 'your rounds', shape: 'dot' },
            { color: 'var(--ok)', label: `fitted line (${fit.ok ? 'your fit' : 'the synthetic participant'})`, shape: 'line' },
            { color: 'var(--dim)', label: 'synthetic participant', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <span ref={nextBtn} className="ul-btn-wrap"><Button variant="primary" onClick={next} disabled={open || !round}>{round ? `Next round (${round.n} items)` : 'All rounds done'}</Button></span>
          <Toggle label="Menu order" value={alphabetical} onChange={(v) => reset({ alphabetical: v })} off="Shuffled" on="Alphabetical" />
          <Button onClick={() => reset({ seed: seed + 1 })}>Start over</Button>
        </>,
      ]}
    >
      <div className="stage-pad ul-col">
        <div className="ul-menu-box" onPointerDownCapture={(e) => { lastPointer.current = e.pointerType; }}>
          {open && round ? (
            <>
              <p className="ul-prompt">Click <b className="ul-want">{round.target}</b></p>
              <div className="ul-menu" role="group" aria-label={`Menu of ${round.n} items; arrow keys move`}>
                {round.items.map((it, i) => (
                  <button
                    key={it}
                    ref={(el) => { items.current[i] = el; }}
                    type="button"
                    className="ul-item"
                    tabIndex={i === focusAt ? 0 : -1}
                    onKeyDown={(e) => onKey(e, i)}
                    onClick={(e) => choose(e, it)}
                  >
                    {it}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="ul-arena-note">{round ? 'Press Next round: a menu appears and the clock starts.' : 'All rounds done. Start over for another run.'}</p>
          )}
        </div>
        <div className="ul-row">
          <TimePlot own={trials} synth={SYNTH_HICK} fit={shown} xLabel="log₂(n + 1) (bits)" xMax={5.5} ariaLabel="Decision time against log₂(n + 1)" />
          <Hint block className="ul-side-note">
            Hick&apos;s law (Hick 1952, Hyman 1953) holds for unfamiliar, equally likely choices with a fixed mapping. Practised users, menus you can search
            (alphabetical, grouped, or with type-to-filter) and options that aren&apos;t equally likely all beat it. Times here also include reading the prompt and moving
            the pointer. The synthetic participant&apos;s constants are illustrative.
          </Hint>
        </div>
        <Hint block className="ul-honest">Your own clicks, timed by the browser (± a few ms). The grey participant is synthetic.</Hint>
      </div>
    </StageFrame>
  );
}
