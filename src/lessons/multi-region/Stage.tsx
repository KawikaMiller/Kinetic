import { useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, pad2 } from '../../core/format';
import { useInterval } from '../../core/useInterval';
import {
  ASYNC_LAG_S, CLOCK_LIMIT_S, latencyStats, MODE_INFO, phaseOf, primaryRegion, REGIONS, replicaPairs, routesFor, WRITES_PER_S,
  type Mode, type RegionId, type Replication,
} from './model';
import { RegionMap } from './RegionMap';
import './styles.css';

const SIM_SPEED = 60; // 1 real second = 1 simulated minute during failover
const TICK_MS = 100;
/** A worst-case round trip above this reads as "slow" (red). */
const SLOW_RTT_MS = 150;
/** The concurrent-edit verdict appears after the two writes have landed. */
const CONFLICT_VERDICT_MS = 1500;

const INTRO: Record<Mode, ReactNode> = {
  single: (
    <>
      <b>Single region</b>: everyone talks to us-east. Cheap and simple, but Asia pays <span className="hl bad">~220 ms</span> per round
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

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('single');
  const [replication, setReplication] = useState<Replication>('async');
  const [dead, setDead] = useState<RegionId[]>([]);
  const [clock, setClock] = useState<number | null>(null);
  const [residency, setResidency] = useState(false);
  const [conflict, setConflict] = useState(0);
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
        <span className={`hl ${phaseDone ? 'ok' : ''}`}>{phaseText}</span> {lossNote}
      </>,
    );
  }, [phaseText, phaseDone, lossNote, setCaption]);

  useEffect(() => {
    if (!conflict) return;
    const id = setTimeout(() => {
      setCaption(
        replication === 'sync' ? (
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
  }, [conflict, replication, setCaption]);

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
    if (dead.includes(r)) {
      setDead(dead.filter((x) => x !== r));
      setClock(null);
      setLossNote(null);
      setCaption(<>{REGIONS[r].name} is back. Traffic fails back to the original setup.</>);
      return;
    }
    setDead([...dead, r]);
    const serving = mode === 'active' || r === 'us' || (mode === 'passive' && r === 'eu' && dead.includes('us'));
    if (serving) setClock(0);
    if (mode === 'passive' && r === 'eu' && !dead.includes('us')) {
      setCaption(<>The standby died. Users don't notice, but you've <span className="hl bad">lost your safety net</span> until it's rebuilt.</>);
    } else if (mode === 'single' && r !== 'us') {
      setCaption(<>Nothing runs in {REGIONS[r].name} in this setup, so nothing happens.</>);
    } else if (mode !== 'single' && serving) {
      setLossNote(
        replication === 'async' ? (
          <>
            Its last <span className="hl bad">~{ASYNC_LAG_S} s</span> of unreplicated writes (≈ {Math.round(ASYNC_LAG_S * WRITES_PER_S)} orders)
            are lost: that's the <b>RPO</b>.
          </>
        ) : (
          <>Sync replication: every committed write already exists in another region, so <span className="hl ok">RPO = 0</span>.</>
        ),
      );
    } else if (mode === 'single') {
      setLossNote(<>Anything since the last backup is at risk, and there's nowhere to fail over to.</>);
    }
  };

  const reset = () => {
    setDead([]);
    setClock(null);
    setLossNote(null);
    setConflict(0);
    setCaption(INTRO[mode]);
  };

  const downtime = clock !== null && phase ? clock : null;
  const info = MODE_INFO[mode];

  return (
    <StageFrame minWidth={700}
      height={470}
      stats={
        <Stats>
          <Stat label="Avg read latency" value={stats.anyServed ? `${Math.round(stats.avgRead)} ms` : NA} color="var(--info)" sub="round trip, by users" />
          <Stat label="Worst user" value={stats.worst === null ? NA : `${stats.worst} ms`} color={stats.worst !== null && stats.worst > SLOW_RTT_MS ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Avg write latency" value={stats.avgWrite === null ? NA : `${Math.round(stats.avgWrite)} ms`} color="var(--violet)" sub={replication === 'sync' && mode !== 'single' ? 'waits for replicas' : 'local commit'} />
          <Stat label="Users down" value={`${Math.round(stats.downShare * 100)}%`} color={stats.downShare ? 'var(--bad)' : 'var(--ok)'} sub={downtime !== null ? `downtime ${minSec(downtime)}` : undefined} />
          <Stat label="RPO / RTO" value={<span className="mr-small">{info.rpo(replication)}</span>} sub={info.rto} />
          <Stat label="Cost" value={info.cost} sub="vs one region" />
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
              { value: 'single', label: 'Single region' },
              { value: 'passive', label: 'Active-passive' },
              { value: 'active', label: 'Active-active' },
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
    </StageFrame>
  );
}
