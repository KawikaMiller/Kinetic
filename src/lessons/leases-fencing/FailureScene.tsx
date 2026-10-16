import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Provenance, ProvenanceRow, Segmented, Slider, Toggle, Button } from '../../components/ui';
import { SeedField } from '../../components/SeedField';
import { usePlayer } from '../../core/usePlayer';
import { leaseFrames } from './captions';
import { initialFailure, pinnedText } from './init';
import {
  DRIFT_RANGE, FENCE_MODES, MODE_LABEL, NET_RANGE, OFFSET_RANGE, PAUSE_RANGE, PINNED_SEED, TTL_RANGE, runLease, sweepSetup, verdictOf, type LeaseSetup,
} from './model';
import { LEGEND, RunPanels, RunStats } from './RunPanels';

const MODE_OPTIONS = FENCE_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }));
const PAUSE_AT_OPTIONS = [
  { value: 'job' as const, label: 'during the job' },
  { value: 'write' as const, label: 'just before the write' },
];
const PLAY_MS = 130;
const seconds = (ms: number) => `${ms / 1000} s`;
const signedSeconds = (ms: number) => `${ms > 0 ? '+' : ''}${ms / 1000} s`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function FailureScene({ picker }: { picker: ReactNode }) {
  const [setup, setSetup] = useState(initialFailure);
  const patch = (p: Partial<LeaseSetup>) => setSetup((s) => ({ ...s, ...p }));
  const run = useMemo(() => runLease(setup), [setup]);
  const verdict = useMemo(() => verdictOf(setup), [setup]);
  const frames = useMemo(() => leaseFrames(run, verdict), [run, verdict]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;
  const pinned = PINNED_SEED[setup.mode];

  return (
    <StageFrame
      height={520}
      player={player}
      stats={<RunStats run={run} now={now} verdict={verdict} />}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Safeguard" value={setup.mode} onChange={(mode) => patch({ mode })} options={MODE_OPTIONS} />
        </>,
        <>
          <Slider label="Lease TTL" value={setup.ttlMs} min={TTL_RANGE.min} max={TTL_RANGE.max} step={TTL_RANGE.step} format={seconds} onChange={(ttlMs) => patch({ ttlMs })} />
          <Slider label="Pause of client A" value={setup.pauseMs} min={PAUSE_RANGE.min} max={PAUSE_RANGE.max} step={PAUSE_RANGE.step} format={seconds} onChange={(pauseMs) => patch({ pauseMs })} />
          <Segmented label="Pause lands" value={setup.pauseAt} onChange={(pauseAt) => patch({ pauseAt })} options={PAUSE_AT_OPTIONS} />
        </>,
        <>
          <Slider label="A's clock offset" value={setup.aOffsetMs} min={OFFSET_RANGE.min} max={OFFSET_RANGE.max} step={OFFSET_RANGE.step} format={signedSeconds} onChange={(aOffsetMs) => patch({ aOffsetMs })} />
          <Slider label="A's clock drift" value={setup.aDriftPpm} min={DRIFT_RANGE.min} max={DRIFT_RANGE.max} step={DRIFT_RANGE.step} format={(v) => `${v} ppm`} onChange={(aDriftPpm) => patch({ aDriftPpm })} />
          <Slider label="Messages lost" value={setup.loss} min={NET_RANGE.min} max={NET_RANGE.max} step={NET_RANGE.step} format={percent} onChange={(loss) => patch({ loss })} />
          <Slider label="Messages duplicated" value={setup.duplicate} min={NET_RANGE.min} max={NET_RANGE.max} step={NET_RANGE.step} format={percent} onChange={(duplicate) => patch({ duplicate })} />
          <Toggle label="Lock service" value={setup.lockCrash} onChange={(lockCrash) => patch({ lockCrash })} off="Stays up" on="Restarts once" />
        </>,
        <>
          <SeedField seed={setup.seed} onSeed={(seed) => patch({ seed })} />
          <ChipButton tone="bad" disabled={pinned === null} title={pinned === null ? 'No seed breaks the data rules in this mode' : undefined} onClick={() => pinned !== null && setSetup(sweepSetup(pinned, setup.mode))}>
            {pinned === null ? 'No failing seed' : `Load the lowest failing seed (${pinned})`}
          </ChipButton>
          <Button onClick={() => setSetup(initialFailure())}>Reset</Button>
          <Hint tone="muted">{pinnedText(setup.mode)}</Hint>
        </>,
      ]}
    >
      <div className="lf-stage stage-pad">
        <RunPanels run={run} now={now} verdict={verdict} />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>a lock service, two clients and a storage server on the distSim harness, with delayed, lost and duplicated messages</Provenance>
          <Provenance kind="illustrative">one box stands in for a replicated, linearizable lock service; durations, TTLs and the clock figures are made up (drift of real clocks is far smaller)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
