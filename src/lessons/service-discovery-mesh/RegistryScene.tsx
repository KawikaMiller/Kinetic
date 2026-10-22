import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { integer, pct, sig } from '../../core/format';
import { registryCaption, secText } from './captions';
import { STYLES, STYLE_REFRESH, initialRegistry, registryConfig, type RegistryUi, type Style } from './init';
import { CRASH_AT_MS, HEARTBEAT_MS, HORIZON_MS, INSTANCE_MAX, LOSS_RANGE, REFRESH_RANGE, SERVICES, TTL_BEATS, VICTIM, staleBound, type Service } from './registry';
import { runRegistry } from './run';

const GANTT_MIN_WIDTH = 520;
const LADDER_MESSAGES = 10;
const LADDER_WINDOW_MS = { before: 1200, after: 2600 };

export function RegistryScene({ picker }: { picker: ReactNode }) {
  const [u, setU] = useState<RegistryUi>(initialRegistry);
  const config = useMemo(() => registryConfig(u), [u]);
  const run = useMemo(() => runRegistry(config), [config]);
  const hasVictim = config.crash && config.counts.orders > 0;
  const set = (patch: Partial<RegistryUi>) => setU((x) => ({ ...x, ...patch }));

  useIntroCaption(registryCaption(run), [JSON.stringify(u)]);

  const bars = useMemo<GanttBar[]>(() => {
    if (!hasVictim) return [];
    const evictAt = run.evictedAfterMs === null ? HORIZON_MS : CRASH_AT_MS + run.evictedAfterMs;
    const lastRoute = run.stopAfterMs === null ? CRASH_AT_MS : CRASH_AT_MS + run.stopAfterMs;
    return [
      { id: 'run', lane: 'run', start: 0, end: CRASH_AT_MS, tone: 'ok', label: 'running' },
      { id: 'dead', lane: 'run', start: CRASH_AT_MS, end: HORIZON_MS, tone: 'dim', label: 'stopped' },
      { id: 'listed', lane: 'reg', start: 0, end: CRASH_AT_MS, tone: 'ok', label: 'listed' },
      { id: 'stale', lane: 'reg', start: CRASH_AT_MS, end: Math.max(evictAt, CRASH_AT_MS + 1), tone: 'bad', label: 'dead, listed' },
      ...(lastRoute > CRASH_AT_MS ? [{ id: 'routed', lane: 'route', start: CRASH_AT_MS, end: lastRoute, tone: 'orange' as const, label: 'routed' }] : []),
    ];
  }, [hasVictim, run]);

  const ladder = useMemo(() => {
    const rows = run.cluster.trace.filter((r) => r.t >= CRASH_AT_MS - LADDER_WINDOW_MS.before && r.t <= CRASH_AT_MS + LADDER_WINDOW_MS.after && (r.kind === 'crash' || ((r.kind === 'send' || r.kind === 'drop') && (r.from === VICTIM || r.to === VICTIM))));
    const actors = [{ id: config.cacheOwner === 'lb' ? 'lb' : 'client', label: config.cacheOwner === 'lb' ? 'load balancer' : 'client' }, { id: 'registry', label: 'registry' }, { id: VICTIM, label: VICTIM }];
    const seq = toSequence(rows.slice(0, 60), { actors, events: true, label: (p) => (p as { type: string }).type });
    return { actors: seq.actors, messages: seq.messages.slice(0, LADDER_MESSAGES) };
  }, [run, config.cacheOwner]);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Clients stop sending after" value={run.stopAfterMs === null ? '–' : secText(run.stopAfterMs)} sub={[`bound: TTL + T + sweep and wire = ${secText(staleBound(config))}`, `TTL ${secText(config.ttlBeats * HEARTBEAT_MS)}, T ${secText(config.refreshMs * config.stubbornFactor)}`]} />
          <Stat label="Requests sent to a dead instance" value={integer(run.sentToDead)} color={run.sentToDead > 0 ? 'var(--bad)' : undefined} sub={[`of ${integer(run.requests)} requests`]} />
          <Stat label="False evictions" value={integer(run.falseEvictions)} color={run.falseEvictions > 0 ? 'var(--orange)' : undefined} sub={[`${config.ttlBeats} lost heartbeats in a row at ${pct(config.loss, 0)} loss: ${pct(config.loss ** config.ttlBeats, 1)} per heartbeat`]} />
          <Stat label="Requests with no endpoint" value={integer(run.noEndpoint)} color={run.noEndpoint > 20 ? 'var(--bad)' : undefined} sub={['before the first listing, or a service with no instance']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a healthy, registered instance' },
            { color: 'var(--bad)', label: 'a dead instance still in the registry' },
            { color: 'var(--orange)', label: 'a stale client cache still routing to it' },
            { color: 'var(--dim)', label: 'stopped' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Discovery" value={u.style} onChange={(style: Style) => set({ style, refreshMs: STYLE_REFRESH[style] })} options={STYLES} />
          <Toggle label="Instance orders-1" value={u.crash} onChange={(crash) => set({ crash })} off="keeps running" on="crashes at 10 s, no deregister" />
          <Button onClick={() => setU(initialRegistry())}>Reset</Button>
        </>,
        <>
          {SERVICES.map((s: Service) => (
            <Slider key={s} label={`${s} instances`} value={u.counts[s]} min={0} max={INSTANCE_MAX} onChange={(n) => set({ counts: { ...u.counts, [s]: n } })} />
          ))}
        </>,
        <>
          <Slider label="TTL" value={u.ttlBeats} min={TTL_BEATS.min} max={TTL_BEATS.max} format={(v) => `${v} heartbeats`} onChange={(ttlBeats) => set({ ttlBeats })} />
          <Slider label="Cache refresh (T)" value={u.refreshMs} {...REFRESH_RANGE} format={secText} onChange={(refreshMs) => set({ refreshMs })} />
          <Slider label="Heartbeats lost" value={u.loss} {...LOSS_RANGE} format={(v) => pct(v, 0)} onChange={(loss) => set({ loss })} />
          {u.style === 'dns' && <Toggle label="Resolver" value={u.stubborn} onChange={(stubborn) => set({ stubborn })} off="obeys the TTL" on="caches twice as long" />}
          <SeedField seed={u.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="sd-stage stage-pad">
        <Box>
          <SectionTitle hint={hasVictim ? `${VICTIM} crashes at ${secText(CRASH_AT_MS)}` : 'no crash in this run'}>Who knows what, and when</SectionTitle>
          {hasVictim ? (
            <WideRegion minWidth={GANTT_MIN_WIDTH} label="Registry timeline: scroll sideways to see all of it">
              <GanttLanes
                lanes={[{ id: 'run', label: VICTIM }, { id: 'reg', label: 'registry' }, { id: 'route', label: 'requests' }]}
                bars={bars}
                domain={[0, HORIZON_MS]}
                unit=" ms"
                axis
                size="md"
                labelWidth={110}
                ariaLabel="When the instance stopped, when the registry dropped it and when clients stopped sending to it"
              />
            </WideRegion>
          ) : (
            <p className="sd-note">Nothing stops, so there is nothing to detect. Turn the crash on.</p>
          )}
        </Box>
        <Box>
          <SectionTitle hint="messages to or from the instance around the crash; a cross is a message to a stopped node">The wire</SectionTitle>
          <WideRegion minWidth={420} label="Message ladder: scroll sideways to see all of it">
            <SequenceDiagram actors={ladder.actors} messages={ladder.messages} fit="shown" ariaLabel="Messages to and from the instance around the crash" />
          </WideRegion>
        </Box>
        <Hint tone="muted" block>
          Each instance heartbeats every {sig(HEARTBEAT_MS / 1000)} s and registers itself; the registry evicts one it has not heard from within the TTL. Clients keep a cached listing, so they keep sending to a dead instance until the registry has dropped it and their cache has refreshed. A heartbeat lost {u.ttlBeats} times in a row evicts a live instance.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={u.seed}>nodes, timers and messages run on the distSim harness; the same seed replays the same run</Provenance>
          <Provenance kind="illustrative">the heartbeat interval, TTLs, wire time and request rate are made up; real registries differ</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
