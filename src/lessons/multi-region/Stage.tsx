import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import {
  ASYNC_LAG_S, DETECT_S, DNS_S, MODE_INFO, nearest, PROMOTE_S, REGION_RTT, REGIONS, REROUTE_S, RTT, USERS, WRITES_PER_S,
  type Mode, type RegionId, type Replication, type UserId,
} from './model';
import './styles.css';

const ALL_REGIONS: RegionId[] = ['us', 'eu', 'ap'];
const ALL_USERS: UserId[] = ['na', 'euu', 'apu'];
const SIM_SPEED = 60; // 1 real second = 1 simulated minute during failover
const TICK_MS = 100;

type RouteState = 'ok' | 'failing' | 'down';
interface Route {
  region: RegionId | null;
  state: RouteState;
}

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

function phaseOf(mode: Mode, dead: RegionId[], clock: number | null): { text: string; done: boolean } | null {
  if (clock === null || dead.length === 0) return null;
  if (mode === 'single') return dead.includes('us') ? { text: 'Outage: there is no other region to fail over to', done: false } : null;
  if (mode === 'passive') {
    if (!dead.includes('us')) return null;
    if (dead.includes('eu')) return { text: 'Primary and standby both down: total outage', done: false };
    if (clock < DETECT_S) return { text: 'Detecting: health checks to us-east failing', done: false };
    if (clock < PROMOTE_S) return { text: 'Promoting the eu-west standby to primary', done: false };
    if (clock < DNS_S) return { text: 'DNS TTL expiring: clients reconnecting to eu-west', done: false };
    return { text: 'Recovered: eu-west is the new primary', done: true };
  }
  if (clock < REROUTE_S) return { text: 'Health checks failing: rerouting users to the next-nearest region', done: false };
  return { text: 'Rerouted: surviving regions absorb the traffic', done: true };
}

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('single');
  const [replication, setReplication] = useState<Replication>('async');
  const [dead, setDead] = useState<RegionId[]>([]);
  const [clock, setClock] = useState<number | null>(null);
  const [residency, setResidency] = useState(false);
  const [conflict, setConflict] = useState(0);

  const phase = phaseOf(mode, dead, clock);
  const running = clock !== null && !!phase && !phase.done && clock < 3600;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setClock((c) => (c === null ? c : c + (SIM_SPEED * TICK_MS) / 1000)), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    setCaption(INTRO[mode]);
  }, [mode, setCaption]);

  const [lossNote, setLossNote] = useState<ReactNode>(null);
  const phaseText = phase?.text ?? null;
  const phaseDoneNow = phase?.done ?? false;
  useEffect(() => {
    if (!phaseText) return;
    setCaption(
      <>
        <span className={`hl ${phaseDoneNow ? 'ok' : ''}`}>{phaseText}</span> {lossNote}
      </>,
    );
  }, [phaseText, phaseDoneNow, lossNote, setCaption]);

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
    }, 1500);
    return () => clearTimeout(id);
  }, [conflict, replication, setCaption]);

  const alive = ALL_REGIONS.filter((r) => !dead.includes(r));
  const phaseDone = phase?.done ?? false;

  const route = (u: UserId): Route => {
    if (mode === 'single') return dead.includes('us') ? { region: null, state: 'down' } : { region: 'us', state: 'ok' };
    if (mode === 'passive') {
      if (!dead.includes('us')) return { region: 'us', state: 'ok' };
      if (dead.includes('eu')) return { region: null, state: 'down' };
      return phaseDone ? { region: 'eu', state: 'ok' } : { region: null, state: 'failing' };
    }
    const home = nearest(u, ALL_REGIONS)!;
    if (dead.includes(home) && !phaseDone) return { region: null, state: alive.length ? 'failing' : 'down' };
    const r = nearest(u, alive);
    return r ? { region: r, state: 'ok' } : { region: null, state: 'down' };
  };
  const routes = Object.fromEntries(ALL_USERS.map((u) => [u, route(u)])) as Record<UserId, Route>;

  const primary: RegionId | null = mode === 'passive' ? (dead.includes('us') ? (phaseDone ? 'eu' : null) : 'us') : null;
  const replicaPairs: [RegionId, RegionId][] = (() => {
    if (mode === 'passive') return !dead.includes('us') && !dead.includes('eu') ? [['us', 'eu']] : [];
    if (mode === 'active') {
      const pairs: [RegionId, RegionId][] = [];
      for (const a of alive) for (const b of alive) if (a !== b) pairs.push([a, b]);
      return pairs;
    }
    return [];
  })();

  const served = ALL_USERS.filter((u) => routes[u].state === 'ok');
  const avgLatency = served.reduce((s, u) => s + USERS[u].share * RTT[u][routes[u].region!], 0) / Math.max(1e-9, served.reduce((s, u) => s + USERS[u].share, 0));
  const worst = served.length ? Math.max(...served.map((u) => RTT[u][routes[u].region!])) : null;
  const downShare = ALL_USERS.filter((u) => routes[u].state !== 'ok').reduce((s, u) => s + USERS[u].share, 0);
  const syncPenalty = (r: RegionId) => {
    if (replication !== 'sync' || mode === 'single') return 0;
    const peers = mode === 'passive' ? (r === 'us' && !dead.includes('eu') ? ['eu' as RegionId] : []) : alive.filter((x) => x !== r);
    return peers.length ? Math.max(...peers.map((p) => REGION_RTT[r][p])) : 0;
  };
  const writeLatency = served.length
    ? served.reduce((s, u) => s + USERS[u].share * (RTT[u][routes[u].region!] + syncPenalty(routes[u].region!)), 0) / served.reduce((s, u) => s + USERS[u].share, 0)
    : null;

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
    const next = [...dead, r];
    setDead(next);
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

  const regionsInUse: RegionId[] = mode === 'single' ? ['us'] : mode === 'passive' ? ['us', 'eu'] : ALL_REGIONS;
  const downtime = clock !== null && phase ? clock : null;
  const info = MODE_INFO[mode];

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Avg read latency" value={served.length ? `${Math.round(avgLatency)} ms` : '–'} color="var(--info)" sub="round trip, by users" />
          <Stat label="Worst user" value={worst === null ? '–' : `${worst} ms`} color={worst !== null && worst > 150 ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Avg write latency" value={writeLatency === null ? '–' : `${Math.round(writeLatency)} ms`} color="var(--violet)" sub={replication === 'sync' && mode !== 'single' ? 'waits for replicas' : 'local commit'} />
          <Stat label="Users down" value={`${Math.round(downShare * 100)}%`} color={downShare ? 'var(--bad)' : 'var(--ok)'} sub={downtime !== null ? `downtime ${fmtClock(downtime)}` : undefined} />
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
            <Button onClick={() => { setConflict((c) => c + 1); setCaption(<>A US user and an EU user edit the <b>same cart</b> at the same moment…</>); }}>
              Concurrent edit
            </Button>
          )}
          <Button onClick={() => setResidency((v) => !v)}>{residency ? 'Residency: on' : 'EU data residency'}</Button>
          <Button onClick={reset}>Reset</Button>
        </Controls>
      }
    >
      <svg className="mr-svg" viewBox="0 0 900 400" role="img" aria-label="World map with regions">
        <defs>
          <pattern id="mr-dots" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" className="mr-dot" />
          </pattern>
        </defs>
        {CONTINENTS.map((d, i) => (
          <path key={i} d={d} className="mr-land" fill="url(#mr-dots)" />
        ))}

        {/* replication links */}
        {replicaPairs.filter(([a, b]) => a < b || mode === 'passive').map(([a, b]) => {
          const blocked = residency && (a === 'eu' || b === 'eu') && mode === 'active';
          return (
            <line
              key={`rep-${a}-${b}`}
              x1={REGIONS[a].x}
              y1={REGIONS[a].y}
              x2={REGIONS[b].x}
              y2={REGIONS[b].y}
              className={`mr-rep ${blocked ? 'blocked' : ''}`}
            />
          );
        })}
        {replicaPairs.map(([a, b], i) =>
          residency && mode === 'active' && a === 'eu' ? null : (
            <motion.circle
              key={`repdot-${mode}-${a}-${b}`}
              r={4}
              className="mr-rep-dot"
              initial={{ cx: REGIONS[a].x, cy: REGIONS[a].y }}
              animate={{ cx: [REGIONS[a].x, REGIONS[b].x], cy: [REGIONS[a].y, REGIONS[b].y] }}
              transition={{ duration: 0.6 + REGION_RTT[a][b] / 150, repeat: Infinity, delay: i * 0.3, ease: 'linear' }}
            />
          ),
        )}

        {/* user → region requests */}
        {ALL_USERS.map((u) => {
          const r = routes[u];
          const U = USERS[u];
          if (!r.region) return null;
          const R = REGIONS[r.region];
          const dur = 0.3 + RTT[u][r.region] / 110;
          return (
            <g key={`req-${u}`}>
              <line x1={U.x} y1={U.y} x2={R.x} y2={R.y} className="mr-req" />
              {[0, 1, 2].map((k) => (
                <motion.circle
                  key={`${u}-${r.region}-${mode}-${k}`}
                  r={4.5}
                  className="mr-req-dot"
                  initial={{ cx: U.x, cy: U.y, opacity: 0 }}
                  animate={{ cx: [U.x, R.x, U.x], cy: [U.y, R.y, U.y], opacity: [1, 1, 1] }}
                  transition={{ duration: dur * 2, repeat: Infinity, delay: (k * dur * 2) / 3, ease: 'linear' }}
                />
              ))}
            </g>
          );
        })}

        {/* conflicting writes */}
        {mode === 'active' && conflict > 0 && (
          <g key={`conflict-${conflict}`}>
            {(['na', 'euu'] as UserId[]).map((u) => {
              const r = routes[u].region;
              if (!r) return null;
              return (
                <motion.circle
                  key={u}
                  r={7}
                  className="mr-write"
                  initial={{ cx: USERS[u].x, cy: USERS[u].y, opacity: 1 }}
                  animate={{ cx: REGIONS[r].x, cy: REGIONS[r].y, opacity: [1, 1, 0] }}
                  transition={{ duration: 0.9 }}
                />
              );
            })}
            {replication === 'async' &&
              (['us', 'eu'] as RegionId[]).filter((r) => alive.includes(r)).map((r) => (
                <motion.circle
                  key={`boom-${r}`}
                  cx={REGIONS[r].x}
                  cy={REGIONS[r].y}
                  className="mr-conflict"
                  initial={{ r: 10, opacity: 0 }}
                  animate={{ r: [10, 44], opacity: [0.9, 0] }}
                  transition={{ delay: 1.2, duration: 1, repeat: 2 }}
                />
              ))}
          </g>
        )}

        {/* regions */}
        {ALL_REGIONS.map((r) => {
          const R = REGIONS[r];
          const isDead = dead.includes(r);
          const inUse = regionsInUse.includes(r);
          const serving = ALL_USERS.some((u) => routes[u].region === r);
          const role = mode === 'passive' ? (primary === r ? 'primary' : r === 'eu' ? 'standby' : r === 'us' ? 'old primary' : '') : '';
          const cls = isDead ? 'dead' : serving ? 'serving' : inUse ? 'standby' : 'unused';
          return (
            <g key={r} className={`mr-region ${cls}`} onClick={() => toggleRegion(r)}>
              <title>{isDead ? 'Click to restore' : 'Click to kill this region'}</title>
              {serving && !isDead && (
                <motion.circle
                  cx={R.x}
                  cy={R.y}
                  fill="none"
                  className="mr-pulse"
                  initial={{ r: 16, opacity: 0.6 }}
                  animate={{ r: [16, 30], opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
              )}
              <rect x={R.x - 16} y={R.y - 16} width={32} height={32} rx={8} />
              <text x={R.x} y={R.y + 5} textAnchor="middle" className="mr-icon">
                {isDead ? '✕' : '▦'}
              </text>
              <text x={R.x} y={R.y + 34} textAnchor="middle" className="mr-rname">
                {R.name}
              </text>
              <text x={R.x} y={R.y + 48} textAnchor="middle" className="mr-rcity">
                {role || R.city}
              </text>
            </g>
          );
        })}

        {/* users */}
        {ALL_USERS.map((u) => {
          const U = USERS[u];
          const r = routes[u];
          const label = r.state === 'ok' ? `${RTT[u][r.region!]} ms → ${REGIONS[r.region!].name}` : r.state === 'failing' ? 'failing over…' : 'DOWN';
          const outOfRegion = residency && u === 'euu' && (mode !== 'active' || (r.region && r.region !== 'eu'));
          return (
            <g key={u} className={`mr-user ${r.state}`}>
              <circle cx={U.x} cy={U.y} r={11} />
              <text x={U.x} y={U.y + 4} textAnchor="middle" className="mr-uicon">
                ☺
              </text>
              <text x={U.x} y={U.y - 18} textAnchor="middle" className="mr-uname">
                {U.name} · {Math.round(U.share * 100)}%
              </text>
              <g transform={`translate(${U.x}, ${U.y + 30})`}>
                <rect x={-62} y={-12} width={124} height={20} rx={10} className="mr-lat" />
                <text x={0} y={2} textAnchor="middle" className="mr-lat-text">
                  {label}
                </text>
              </g>
              {outOfRegion && (
                <text x={U.x} y={U.y + 58} textAnchor="middle" className="mr-resid">
                  ⚠ EU data stored outside the EU
                </text>
              )}
            </g>
          );
        })}

        {phase && (
          <g className={`mr-phase ${phase.done ? 'done' : ''}`}>
            <rect x={250} y={352} width={400} height={30} rx={15} />
            <text x={450} y={372} textAnchor="middle">
              {phase.text}
            </text>
          </g>
        )}
        {residency && mode === 'active' && (
          <text x={452} y={48} textAnchor="middle" className="mr-resid ok">
            EU records pinned to eu-west: not replicated out of the EU
          </text>
        )}
      </svg>
    </StageFrame>
  );
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Deliberately rough, stylised continents (900 × 400 map).
const CONTINENTS = [
  'M60,90 C90,50 200,40 300,60 C340,70 330,110 300,130 C280,150 300,190 260,210 C230,230 200,215 180,240 C160,250 140,220 120,190 C95,160 60,140 60,90 Z',
  'M240,250 C270,240 310,255 320,280 C330,320 300,360 280,395 C265,405 255,380 250,350 C240,320 225,280 240,250 Z',
  'M420,90 C440,70 500,65 540,80 C560,95 545,125 530,140 C510,165 470,165 445,150 C425,135 410,110 420,90 Z',
  'M440,185 C480,170 540,180 565,210 C580,240 560,280 540,320 C525,350 500,370 485,350 C470,320 470,290 450,260 C430,235 420,200 440,185 Z',
  'M560,70 C620,40 760,40 840,70 C880,90 870,140 830,170 C800,190 790,230 750,250 C720,265 690,240 660,220 C630,200 600,190 580,160 C560,130 540,100 560,70 Z',
  'M730,310 C760,295 820,300 840,325 C850,350 820,375 790,375 C760,375 725,360 720,340 C715,325 720,315 730,310 Z',
];
