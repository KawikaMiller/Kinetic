import { useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Controls, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, pad2 } from '../../core/format';
import { useInterval } from '../../core/useInterval';
import {
  ASYNC_LAG_S, CLOCK_LIMIT_S, costFactor, DETECT_S, DNS_S, PROMOTE_S, latencyStats, MODE_LABEL, phaseOf, primaryRegion, REGIONS, replicaPairs, routesFor, rpoText, RTT, rtoText, toggleRegion as applyToggle, type FailureLoss, type ToggleEvent, WRITES_PER_S,
  type Mode, type RegionId, type Replication,
} from './model';
import { RegionMap } from './RegionMap';
import './styles.css';

const WIDE_MIN_PX = 700;
const SIM_SPEED = 60; // 1 real second = 1 simulated minute during failover
const TICK_MS = 100;
/** A worst-case round trip above this reads as "slow" (red). */
const SLOW_RTT_MS = 150;
/** The concurrent-edit verdict appears after the two writes have landed. */
const CONFLICT_VERDICT_MS = 1500;

const INTRO: Record<Mode, ReactNode> = {
  single: (
    <>
      <b>Single region</b>: everyone talks to us-east. Cheap and simple, but Asia pays <span className="hl bad">{RTT.apu.us} ms</span> per round
      trip, and one region outage is a total outage.
    </>
  ),
  passive: (
    <>
      <b>Active-passive</b>: us-east serves everyone and <span className="hl violet">replicates</span> to a standby in eu-west. Kill
      us-east to watch a failover.
    </>
  ),
  active: (
    <>
      <b>Active-active</b>: every region serves its local users, and writes replicate in <b>all directions</b>. Fast everywhere,
      but now two regions can change the same data at once.
    </>
  ),
};

/** Simulated seconds as 'M:SS'. */
const minSec = (s: number) => `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}`;

const ORDERS_LOST = Math.round(ASYNC_LAG_S * WRITES_PER_S);

/** What a failure lost, from the replicas that were alive just before it (the RPO stat describes the exposure from now on). */
function lossSentence(loss: FailureLoss): ReactNode {
  switch (loss.kind) {
    case 'backup':
      return <>Anything since the last backup is at risk, and there's nowhere to fail over to.</>;
    case 'lag':
      return (
        <>
          Its last <span className="hl bad wrap">~{ASYNC_LAG_S} s</span> of unreplicated writes (≈ {ORDERS_LOST} orders) are lost: that's the <b>RPO</b>.
        </>
      );
    case 'zero':
      return (
        <>
          Sync replication: each committed write already existed in another live region, so this failure lost <span className="hl ok">nothing (RPO = 0)</span>.
          The RPO stat now shows what the next failure would cost.
        </>
      );
    case 'no-replica':
      return loss.replication === 'async' ? (
        <>
          No other region was alive, so nothing was replicating: <span className="hl bad wrap">everything written since the last replica died</span> is
          lost, far more than the ~{ASYNC_LAG_S} s lag.
        </>
      ) : (
        <>Sync replication, but no other region was alive: the committed writes existed only here, so they are <span className="hl bad">lost</span>.</>
      );
  }
}

/** The caption a click on a region sets, or null when the failover phase text describes the new state. */
function toggleCaption(mode: Mode, r: RegionId, event: ToggleEvent): ReactNode {
  switch (event.kind) {
    case 'restored':
      return event.stillDown.length === 0 ? (
        <>{REGIONS[r].name} is back. Traffic fails back to the original setup.</>
      ) : (
        <>{REGIONS[r].name} is back; {event.stillDown.map((x) => REGIONS[x].name).join(' and ')} still down.</>
      );
    case 'standby-died':
      return <>The standby died. Users don't notice, but you've <span className="hl bad">lost your safety net</span> until it's rebuilt.</>;
    case 'unused':
      return <>Nothing runs in {REGIONS[r].name} in this setup ({MODE_LABEL[mode]}), so nothing happens.</>;
    case 'failed':
      return null;
  }
}

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('single');
  const [replication, setReplication] = useState<Replication>('async');
  const [dead, setDead] = useState<RegionId[]>([]);
  const [clock, setClock] = useState<number | null>(null);
  const [residency, setResidency] = useState(false);
  const [conflict, setConflict] = useState(0);
  /** The replication setting at the moment of the last Concurrent edit press: toggling it later does not re-judge that edit. */
  const [conflictReplication, setConflictReplication] = useState<Replication>('async');
  const [lossNote, setLossNote] = useState<ReactNode>(null);

  const phase = phaseOf(mode, dead, clock);
  const running = clock !== null && !!phase && !phase.done && clock < CLOCK_LIMIT_S;
  useInterval(() => setClock((c) => (c === null ? c : c + (SIM_SPEED * TICK_MS) / 1000)), TICK_MS, running);

  useIntroCaption(INTRO[mode], [mode]);

  const phaseText = phase?.text ?? null;
  const phaseDone = phase?.done ?? false;
  useEffect(() => {
    if (!phaseText) return;
    setCaption(
      <>
        <span className={`hl wrap ${phaseDone ? 'ok' : ''}`}>{phaseText}</span> {lossNote}
      </>,
    );
  }, [phaseText, phaseDone, lossNote, setCaption]);

  useEffect(() => {
    if (!conflict) return;
    const id = setTimeout(() => {
      setCaption(
        conflictReplication === 'sync' ? (
          <>
            With <b>sync</b> replication the second write had to wait for the first to commit everywhere, so no conflict, at the cost of
            a slower write.
          </>
        ) : (
          <>
            <span className="hl bad">Conflict</span>: both regions accepted a change to cart #42 before hearing about the other.
            Last-writer-wins silently drops one; the fixes are merge logic, CRDTs, or giving each record a <b>home region</b>.
          </>
        ),
      );
    }, CONFLICT_VERDICT_MS);
    return () => clearTimeout(id);
  }, [conflict, conflictReplication, setCaption]);

  const routes = routesFor(mode, dead, phaseDone);
  const stats = latencyStats(routes, mode, replication, dead);

  const changeMode = (m: Mode) => {
    setMode(m);
    setDead([]);
    setClock(null);
    setLossNote(null);
    setConflict(0);
  };

  const toggleRegion = (r: RegionId) => {
    const { state, event } = applyToggle(mode, replication, { dead, clock }, r);
    setDead(state.dead);
    setClock(state.clock);
    setLossNote(event.kind === 'failed' ? lossSentence(event.loss) : null);
    const caption = toggleCaption(mode, r, event);
    if (caption) setCaption(caption);
  };

  const reset = () => {
    setDead([]);
    setClock(null);
    setLossNote(null);
    setConflict(0);
    setCaption(INTRO[mode]);
  };

  const downtime = clock !== null && phase ? clock : null;

  return (
    <StageFrame
      height={0}
      stats={
        <Stats>
          <Stat label="Avg read latency" value={stats.anyServed ? `${Math.round(stats.avgRead)} ms` : NA} color="var(--info)" sub="round trip, by users" />
          <Stat label="Worst user" value={stats.worst === null ? NA : `${stats.worst} ms`} color={stats.worst !== null && stats.worst > SLOW_RTT_MS ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Avg write latency" value={stats.avgWrite === null ? NA : `${Math.round(stats.avgWrite)} ms`} color="var(--violet)" sub={stats.waitsForReplicas ? 'waits for replicas' : 'local commit'} />
          <Stat label="Users down" value={`${Math.round(stats.downShare * 100)}%`} color={stats.downShare ? 'var(--bad)' : 'var(--ok)'} sub={downtime !== null ? `downtime ${minSec(downtime)}` : undefined} />
          <Stat label="RPO now / RTO" value={<span className="mr-small">{rpoText(mode, replication, dead)}</span>} sub={rtoText(mode)} />
          <Stat label="Cost" value={`${costFactor(mode)}×`} sub="regions, vs one region" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'user request', shape: 'dot' },
            { color: 'var(--violet)', label: 'replication', shape: 'dot' },
            { color: 'var(--ok)', label: 'serving region' },
            { color: 'var(--dim)', label: 'standby / unused' },
            { color: 'var(--bad)', label: 'region down' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Topology"
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'single', label: MODE_LABEL.single },
              { value: 'passive', label: MODE_LABEL.passive },
              { value: 'active', label: MODE_LABEL.active },
            ]}
          />
          <Segmented
            label="Replication"
            value={replication}
            onChange={setReplication}
            options={[
              { value: 'async', label: 'Async' },
              { value: 'sync', label: 'Sync' },
            ]}
          />
          <Button variant="danger" onClick={() => toggleRegion('us')}>
            {dead.includes('us') ? 'Restore us-east' : 'Kill us-east'}
          </Button>
          {mode === 'active' && (
            <Button
              onClick={() => {
                setConflictReplication(replication);
                setConflict((c) => c + 1);
                setCaption(<>A US user and an EU user edit the <b>same cart</b> at the same moment…</>);
              }}
            >
              Concurrent edit
            </Button>
          )}
          <Button onClick={() => setResidency((v) => !v)}>{residency ? 'Residency: on' : 'EU data residency'}</Button>
          <Button onClick={reset}>Reset</Button>
        </Controls>
      }
    >
      <WideRegion minWidth={WIDE_MIN_PX}>
        <RegionMap
          mode={mode}
          replication={replication}
          residency={residency}
          conflict={conflict}
          dead={dead}
          routes={routes}
          primary={primaryRegion(mode, dead, phaseDone)}
          pairs={replicaPairs(mode, dead)}
          phase={phase}
          onToggleRegion={toggleRegion}
        />
      </WideRegion>
      <ProvenanceRow>
        <Provenance kind="simulated">
          failover and replication are a model on a made-up clock: one real second is one simulated minute, and a region fails when you click it
        </Provenance>
        <Provenance kind="illustrative">
          round-trip times, user shares, the {DETECT_S} s, {PROMOTE_S} s and {DNS_S} s failover phases, the {ASYNC_LAG_S} s replication lag and {WRITES_PER_S} writes a second are invented; cost counts regions only
        </Provenance>
        <Provenance kind="from-memory">light covers about 200 km per millisecond in fibre (so 1 ms of round trip per 100 km): verify against a physics reference</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
