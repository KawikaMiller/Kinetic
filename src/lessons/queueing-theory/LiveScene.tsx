import { useEffect, useState, type ReactNode } from 'react';
import { Bars, HLine, Plot2D } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Hint, Legend, PauseButton, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useTickSim } from '../../core/useTickSim';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { liveCaption } from './frames';
import {
  LIVE_DEFAULT, LIVE_MAX_TICKS_PER_FRAME, LIVE_TICK_REAL_SECONDS, MU, QUEUE_ICONS, RECENT_JOBS, RHO_RANGE, SHAPES, SHAPE_CV2, SHAPE_KENDALL, SHAPE_NAME,
  createQueueSim, measure, picture, theory, type Measured, type QueueState, type ServiceShape,
} from './model';

const SHAPE_OPTIONS: Option<ServiceShape>[] = SHAPES.map((s) => ({ value: s, label: SHAPE_NAME[s] }));
const SNAPSHOT_SECONDS = 0.12;
const ICON = 24;
const GAP = 4;
const SERVER_W = 64;
const ROW_H = 44;
const DONE_ICONS = 5;

interface Snap {
  state: QueueState;
  measured: Measured;
  waiting: number;
  serving: number | null;
  recent: number[];
}

const fmt = (v: number | null, digits = 3): string => (v === null ? '–' : sig(v, digits));

/** The queue as a row: waiting jobs (blue) walk toward the server, the job in service is yellow, the last few finished ones fade. */
function QueuePicture({ snap, icons }: { snap: Snap; icons: number }) {
  const shown = Math.min(snap.waiting, icons);
  const width = (shown * (ICON + GAP)) + SERVER_W + DONE_ICONS * (ICON + GAP) + 80;
  const serverX = shown * (ICON + GAP) + 24;
  return (
    <svg className="qt-queue" viewBox={`0 0 ${width} ${ROW_H + 10}`} role="img" aria-label={`${snap.waiting} jobs waiting, ${snap.serving === null ? 'the server is idle' : 'one job in service'}`}>
      {Array.from({ length: shown }, (_, i) => (
        <rect key={i} className="qt-waiting" x={serverX - 8 - (i + 1) * (ICON + GAP)} y={8} width={ICON} height={ICON} rx={4} />
      ))}
      <rect className="qt-server" x={serverX} y={2} width={SERVER_W} height={ROW_H - 4} rx={8} />
      {snap.serving !== null && <rect className="qt-serving" x={serverX + (SERVER_W - ICON) / 2} y={8} width={ICON} height={ICON} rx={4} />}
      {Array.from({ length: Math.min(DONE_ICONS, snap.state.completed) }, (_, i) => (
        <rect key={i} className="qt-done" x={serverX + SERVER_W + 12 + i * (ICON + GAP)} y={8} width={ICON} height={ICON} rx={4} opacity={1 - i * 0.18} />
      ))}
    </svg>
  );
}

/** One stat, measured on one line and from theory on the next. */
function TwoLine({ label, measured, theoretical, unit = '' }: { label: ReactNode; measured: number | null; theoretical: number | null; unit?: string }) {
  return (
    <Stat
      label={label}
      value={`${fmt(measured)}${measured === null ? '' : unit}`}
      sub={[
        <span key="m" className="qt-measured">measured so far</span>,
        <span key="t" className="qt-theory">{theoretical === null ? 'theory: no steady state' : `theory ${sig(theoretical)}${unit}`}</span>,
      ]}
    />
  );
}

export function LiveScene({ picker }: { picker: ReactNode }) {
  const [rho, setRho] = useState(LIVE_DEFAULT.rho);
  const [shape, setShape] = useState<ServiceShape>(LIVE_DEFAULT.shape);
  const [seed, setSeed] = useState(LIVE_DEFAULT.seed);
  const narrow = useMediaQuery(PHONE_QUERY);
  const t = theory(rho, shape);

  const live = useTickSim<QueueState, Snap>({
    make: () => createQueueSim({ rho, shape }, seed),
    dt: LIVE_TICK_REAL_SECONDS,
    maxTicksPerFrame: LIVE_MAX_TICKS_PER_FRAME,
    snapshotEvery: SNAPSHOT_SECONDS,
    snapshot: (sim) => {
      const pic = picture(sim.state);
      return { state: sim.state, measured: measure(sim.state), ...pic };
    },
  });
  const { reset } = live;
  // A new utilisation, shape or seed starts a new run (after useTickSim has read the new `make`).
  useEffect(() => {
    reset();
  }, [rho, shape, seed, reset]);

  useIntroCaption(liveCaption(rho, shape), [rho, shape]);

  const snap = live.snap;
  const m = snap?.measured;
  const icons = narrow ? QUEUE_ICONS.narrow : QUEUE_ICONS.wide;
  const unstable = t === null;
  const recent = snap?.recent ?? [];
  const recentTop = Math.max(0.5, ...recent, t ? t.W : 0) * 1.15;

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat
            label={<span className="keep-case">ρ = λ/μ</span>}
            value={pctText(rho, 0)}
            color={unstable ? 'var(--bad)' : undefined}
            sub={[`λ = ${sig(rho * MU)}/s, μ = ${MU}/s`, unstable ? 'no steady state' : `server busy ${m?.busy == null ? '–' : pctText(m.busy, 0)} so far`]}
          />
          <TwoLine label="L, jobs in system" measured={m?.L ?? null} theoretical={t?.L ?? null} />
          <TwoLine label="W, time in system" measured={m?.W ?? null} theoretical={t?.W ?? null} unit=" s" />
          <TwoLine label={<><span className="keep-case">Lq</span>, jobs waiting</>} measured={m?.Lq ?? null} theoretical={t?.Lq ?? null} />
          <TwoLine label={<><span className="keep-case">Wq</span>, wait</>} measured={m?.Wq ?? null} theoretical={t?.Wq ?? null} unit=" s" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'waiting job' },
            { color: 'var(--hi)', label: 'job in service' },
            { color: 'var(--dim)', label: 'finished job' },
            { color: 'var(--violet)', label: 'theory', shape: 'line' },
            { color: 'var(--bad)', label: 'queue past the icons' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Service time" value={shape} onChange={setShape} options={SHAPE_OPTIONS} />
        </>,
        <>
          <Slider label="Utilisation ρ" value={rho} {...RHO_RANGE} format={(v) => pctText(v, 0)} onChange={setRho} />
          <PauseButton paused={live.paused} onToggle={live.togglePause} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="qt-stage stage-pad">
        <Box className="qt-queue-box">
          <SectionTitle hint={`${SHAPE_KENDALL[shape]} · one server, μ = ${MU} jobs/s · ${snap ? sig(snap.state.t, 4) : '0'} model seconds`}>The queue</SectionTitle>
          {snap && <QueuePicture snap={snap} icons={icons} />}
          {snap && snap.waiting > icons && <span className="qt-overflow">+{(snap.waiting - icons).toLocaleString('en-US')} more waiting, past the {icons} icons drawn</span>}
        </Box>
        <Plot2D
          x={{ domain: [0.5, RECENT_JOBS + 0.5], label: `the last ${RECENT_JOBS} jobs to finish, oldest first`, ticks: 4 }}
          y={{ domain: [0, recentTop], label: 'seconds in system', ticks: 4 }}
          ariaLabel="Time in system of the last jobs to finish, against the theoretical mean"
        >
          <Bars bars={recent.map((y, i) => ({ x0: i + 1 - 0.4, x1: i + 1 + 0.4, y }))} tone="info" />
          {t && <HLine at={t.W} tone="violet" dashed label="theory W" />}
        </Plot2D>
        {t && shape !== 'exp' && (
          <Hint tone="muted" className="qt-note">
            Pollaczek-Khinchine factor (1 + CV²)/2 = {sig(t.factor)}: this shape waits {sig(t.factor)}× as long as M/M/1 at the same ρ (CV² = {SHAPE_CV2[shape]}).
          </Hint>
        )}
        {unstable && <Hint tone="muted" className="qt-note">Past ρ = 100% the measured numbers keep climbing instead of settling, and no theory is shown.</Hint>}
        <div className="qt-chips">
          <Provenance kind="simulated" seed={seed}>one seeded run; events are exact, drawn at the tick that holds them</Provenance>
          <Provenance kind="illustrative">μ = {MU} jobs/s is made up; no real system is modelled</Provenance>
          <Provenance kind="from-memory">M/M/1 and Pollaczek-Khinchine results: verify against a queueing text such as Kleinrock or Harchol-Balter</Provenance>
        </div>
        <Hint tone="muted" className="qt-note">M/M/1 assumes Poisson arrivals and exponential service. Real traffic is burstier, so real queues are worse.</Hint>
      </div>
    </StageFrame>
  );
}
