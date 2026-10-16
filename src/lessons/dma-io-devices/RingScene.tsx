import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useInterval } from '../../core/useInterval';
import type { Tone } from '../../core/tone';
import { n, ringCaption } from './captions';
import { BROKEN_CONFIG, DEFAULT_CONFIG, RING_SIZE, TIME_LIMIT_OFF, packetsPerInterrupt, runRing, type Phase, type RingConfig } from './ring';

const PHASE_TONE: Record<Phase, Tone> = { free: 'dim', owned: 'info', filled: 'hi', processing: 'ok', processed: 'ok' };
const PHASE_LABEL: Record<Phase, string> = { free: 'free', owned: 'device-owned', filled: 'filled', processing: 'handling', processed: 'processed' };
const PLAY_MS = 60;
const TICKS_PER_PLAY_STEP = 2;
const LOG_ROWS = 40;
const CELL = { cell: 34 };

export function RingScene({ picker }: { picker: ReactNode }) {
  const [cfg, setCfg] = useState<RingConfig>(DEFAULT_CONFIG);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const sim = useMemo(() => runRing(cfg), [cfg]);
  const end = sim.ticks;
  const tick = Math.min(selected ?? end, end);
  const s = sim.history[tick];

  const edit = (patch: Partial<RingConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setSelected(null);
    setPlaying(false);
  };
  const play = () => {
    setSelected(0);
    setPlaying(true);
  };
  useInterval(() => {
    const next = Math.min(tick + TICKS_PER_PLAY_STEP, end);
    setSelected(next);
    if (next >= end) setPlaying(false);
  }, PLAY_MS, playing);

  const rows: LogRow[] = useMemo(
    () => sim.history.slice(0, tick + 1).flatMap((h) => h.events.map((text, i) => ({ id: `${h.tick}-${i}`, at: `t${h.tick}`, text, tone: text.includes('overwritten') ? ('bad' as const) : text.includes('dropped') ? ('orange' as const) : undefined }))),
    [sim, tick],
  );
  const per = packetsPerInterrupt(s);

  return (
    <StageFrame
      height={470}
      intro={ringCaption(s, cfg)}
      introKey={[s, cfg]}
      stats={
        <Stats>
          <Stat label="Interrupts raised" value={s.irqs} color="var(--pink)" sub={per === null ? 'none yet' : `${per.toFixed(1)} packets per interrupt`} />
          <Stat label="Packets" value={s.produced} sub={[`${s.consumed} consumed`, `${s.dropped} dropped (counted, not hidden)`]} color={s.dropped > 0 ? 'var(--orange)' : undefined} />
          <Stat label="Worst wait" value={`${s.worstLatency} ticks`} sub="arrival to the driver starting on it" />
          {s.overwritten > 0 && <Stat label="Overwritten" value={s.overwritten} color="var(--bad)" sub={`packet ${s.lastOverwritten} lost before it was consumed`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'free (not posted yet)', shape: 'square' },
            { color: 'var(--info)', label: 'device-owned: an empty buffer waiting', shape: 'square' },
            { color: 'var(--hi)', label: 'filled: DONE set, packet inside', shape: 'square' },
            { color: 'var(--ok)', label: 'handled or being handled by the driver', shape: 'square' },
            { color: 'var(--pink)', label: 'interrupts', shape: 'square' },
            { color: 'var(--orange)', label: 'a dropped packet', shape: 'square' },
            { color: 'var(--bad)', label: 'an overwritten packet', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Packet arrival chance" value={cfg.ratePct} min={5} max={100} step={5} onChange={(v) => edit({ ratePct: v })} format={(v) => `${v}% per tick`} />
          <Slider label="Driver ticks per packet" value={cfg.driverTicks} min={1} max={12} onChange={(v) => edit({ driverTicks: v })} />
        </>,
        <>
          <Slider label="Interrupt every N packets" value={cfg.coalesceN} min={1} max={RING_SIZE} onChange={(v) => edit({ coalesceN: v })} />
          <Slider label="...or after waiting" value={cfg.timeLimit} min={4} max={TIME_LIMIT_OFF} step={4} onChange={(v) => edit({ timeLimit: v })} format={(v) => (v >= TIME_LIMIT_OFF ? 'no limit' : `${v} ticks`)} />
        </>,
        <>
          <SeedField key={cfg.seed} seed={cfg.seed} onSeed={(seed) => edit({ seed })} />
          <Toggle label="Driver" value={cfg.broken} onChange={(v) => { setCfg(v ? BROKEN_CONFIG : DEFAULT_CONFIG); setSelected(null); setPlaying(false); }} off="Correct" on="Re-posts a full ring (broken)" />
        </>,
        <>
          <Button variant="primary" onClick={play}>Play from tick 0</Button>
          <Slider label="Tick" value={tick} min={0} max={Math.max(end, 1)} onChange={(v) => { setSelected(v); setPlaying(false); }} />
        </>,
      ]}
    >
      <div className="dma-stage stage-pad">
        <div className="dma-ring">
        <Box>
          <SectionTitle hint="D: the device's next descriptor. T: the driver's next packet">Descriptor ring of {RING_SIZE}</SectionTitle>
          <CellGrid
            rows={RING_SIZE}
            cols={1}
            size={CELL}
            rowLabels={s.ring.map((_, i) => `${i}${i === s.head ? ' D' : ''}${i === s.tail ? ' T' : ''}`)}
            rowDecor={(r) => ({ tone: PHASE_TONE[s.ring[r].phase], label: PHASE_LABEL[s.ring[r].phase] })}
            cell={(r) => {
              const d = s.ring[r];
              return { tone: PHASE_TONE[d.phase], fill: d.phase === 'free' || d.phase === 'owned' ? 'outline' : 'tint', intensity: 0.4, text: d.seq >= 0 ? `#${d.seq}` : '' };
            }}
            cellAriaLabel={(r) => `descriptor ${r}, ${PHASE_LABEL[s.ring[r].phase]}${s.ring[r].seq >= 0 ? `, packet ${s.ring[r].seq}` : ''}`}
            ariaLabel={`Descriptor ring at tick ${s.tick}`}
          />
        </Box>
        <Box>
          <SectionTitle hint="what happened, in order, up to the tick shown">Events</SectionTitle>
          <LogStream label="Ring events" rows={rows} maxHeight={250} follow max={LOG_ROWS} live="off" empty="Nothing has happened yet." />
        </Box>
        </div>
        {sim.violation && (
          <p className="dma-violation" role="status">
            Safety violated at tick {sim.violation.tick} (seed {cfg.seed}): {sim.violation.message}. The run stops here so the counterexample stays on screen.
          </p>
        )}
        <Hint tone="muted" block>
          {n(RING_SIZE)} descriptors. A full ring drops packets and counts them. Interrupt coalescing with no time limit leaves the last few packets waiting unannounced.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={cfg.seed}>seeded packet arrivals</Provenance>
          <Provenance kind="toy">a NIC-style ring, one driver, no real offloads or interrupt moderation hardware</Provenance>
          <Provenance kind="illustrative">ticks, not measured</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
