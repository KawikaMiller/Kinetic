import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer } from '../../core/format';
import { healthCaption, secText } from './captions';
import { healthConfig, initialHealth, type HealthUi } from './init';
import { BROKEN_SEED, HORIZON_MS, READY_AGAIN_MS, UNREADY_AT_MS, VICTIM } from './registry';
import { notReadyViolation, runRegistry } from './run';

const GANTT_MIN_WIDTH = 520;
/** Bars narrower than this drop their label (it stays the tooltip) instead of showing it clipped. */
const GANTT_LABEL_MIN_PX = 72;

export function HealthScene({ picker }: { picker: ReactNode }) {
  const [u, setU] = useState<HealthUi>(initialHealth);
  const config = useMemo(() => healthConfig(u), [u]);
  const run = useMemo(() => runRegistry(config), [config]);
  const violation = useMemo(() => (u.freshLookups ? notReadyViolation(config) : null), [config, u.freshLookups]);
  useIntroCaption(healthCaption(run), [JSON.stringify(u)]);

  const bars = useMemo<GanttBar[]>(() => {
    const last = run.unreadyStopAfterMs === null ? UNREADY_AT_MS : UNREADY_AT_MS + run.unreadyStopAfterMs;
    return [
      { id: 'ok1', lane: 'ready', start: 0, end: UNREADY_AT_MS, tone: 'ok', label: 'ready' },
      { id: 'no', lane: 'ready', start: UNREADY_AT_MS, end: READY_AGAIN_MS, tone: 'dim', label: 'not ready' },
      { id: 'ok2', lane: 'ready', start: READY_AGAIN_MS, end: HORIZON_MS, tone: 'ok', label: 'ready again' },
      ...(last > UNREADY_AT_MS ? [{ id: 'routed', lane: 'route', start: UNREADY_AT_MS, end: last, tone: 'bad' as const, label: 'sent' }] : []),
    ];
  }, [run]);

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Sent while not ready" value={integer(run.sentWhileUnready)} color={run.sentWhileUnready > 0 ? 'var(--bad)' : 'var(--ok)'} sub={['requests to the instance in its not-ready window']} />
          <Stat label="Error answers" value={integer(run.errors)} color={run.errors > 0 ? 'var(--bad)' : undefined} sub={['an instance that is not ready says no']} />
          <Stat label="Last request after" value={run.unreadyStopAfterMs === null ? '–' : secText(run.unreadyStopAfterMs)} sub={['counted from when it went not ready']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'ready' },
            { color: 'var(--dim)', label: 'not ready (inactive, not restarted)' },
            { color: 'var(--bad)', label: 'requests still reaching it' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Registry" value={u.honourReadiness} onChange={(honourReadiness) => setU((x) => ({ ...x, honourReadiness, ...(honourReadiness ? {} : { seed: BROKEN_SEED }) }))} off="ignores readiness" on="leaves not-ready instances out" />
          <Toggle label="Client" value={u.freshLookups} onChange={(freshLookups) => setU((x) => ({ ...x, freshLookups }))} off="caches the listing" on="looks up on every request" />
          <SeedField seed={u.seed} onSeed={(seed) => setU((x) => ({ ...x, seed }))} />
          <Button onClick={() => setU(initialHealth())}>Reset</Button>
        </>,
      ]}
    >
      <div className="sd-stage stage-pad">
        <Box>
          <SectionTitle hint={`${VICTIM} fails readiness at ${secText(UNREADY_AT_MS)}`}>Readiness feeds the registry</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Readiness timeline: scroll sideways to see all of it">
            <GanttLanes lanes={[{ id: 'ready', label: VICTIM }, { id: 'route', label: 'requests to it' }]} bars={bars} domain={[0, HORIZON_MS]} unit=" ms" axis size="md" labelWidth={110} labelMinPx={GANTT_LABEL_MIN_PX} ariaLabel="When the instance was ready and when requests still reached it while it was not" />
          </WideRegion>
        </Box>
        <Hint tone="muted" block>
          {!u.freshLookups ? (
            'The registry invariant is "no listing contains an instance marked not ready". A cached listing is a copy that lags, so it is checked on lookups: turn on "looks up on every request" to see it.'
          ) : violation ? (
            <span className="hl bad wrap">{`Invariant broken (seed ${u.seed}; the lowest failing seed is ${BROKEN_SEED}): ${violation.message}, at ${secText(violation.time)}.`}</span>
          ) : (
            `Invariant holds on seed ${u.seed}: no listing contained ${VICTIM} while it was marked not ready.`
          )}
        </Hint>
        <Hint tone="muted" block>
          A not-ready instance is still running: it keeps heartbeating and tells the registry it is not ready. With readiness honoured it leaves rotation without a restart and comes back by itself. A cached listing still sends requests until its next refresh; a lookup on every request does not.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={u.seed}>the same registry and clients on the distSim harness</Provenance>
          <Provenance kind="illustrative">the timings are made up; the readiness-versus-liveness split is how orchestrators such as Kubernetes describe it (from memory)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
