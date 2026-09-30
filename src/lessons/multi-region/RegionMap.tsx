import { motion } from 'motion/react';
import { CONTINENTS } from './continents';
import {
  ALL_REGIONS, ALL_USERS, REGION_RTT, REGIONS, RTT, USERS, regionsInUse,
  type Mode, type Phase, type RegionId, type Replication, type Route, type UserId,
} from './model';

/** The status pill along the bottom of the map. */
const PHASE_PILL = { x: 250, y: 352, w: 400, h: 30 } as const;
/** Region squares are 32×32; names and cities sit below them. */
const REGION_HALF = 16;
/** Latency label under each user population. */
const LAT_LABEL = { dy: 30, w: 124, h: 20 } as const;
/** Request dots per user: they loop user → region → user, evenly staggered. */
const REQUEST_DOTS = 3;

export function RegionMap({
  mode, replication, residency, conflict, dead, routes, primary, pairs, phase, onToggleRegion,
}: {
  mode: Mode;
  replication: Replication;
  residency: boolean;
  /** Bumped on every "Concurrent edit" click; 0 = none yet. */
  conflict: number;
  dead: RegionId[];
  routes: Record<UserId, Route>;
  primary: RegionId | null;
  pairs: [RegionId, RegionId][];
  phase: Phase | null;
  onToggleRegion: (r: RegionId) => void;
}) {
  const alive = ALL_REGIONS.filter((r) => !dead.includes(r));
  const inUse = regionsInUse(mode);
  return (
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
      {pairs.filter(([a, b]) => a < b || mode === 'passive').map(([a, b]) => {
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
      {pairs.map(([a, b], i) =>
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
            {Array.from({ length: REQUEST_DOTS }, (_, k) => (
              <motion.circle
                key={`${u}-${r.region}-${mode}-${k}`}
                r={4.5}
                className="mr-req-dot"
                initial={{ cx: U.x, cy: U.y, opacity: 0 }}
                animate={{ cx: [U.x, R.x, U.x], cy: [U.y, R.y, U.y], opacity: [1, 1, 1] }}
                transition={{ duration: dur * 2, repeat: Infinity, delay: (k * dur * 2) / REQUEST_DOTS, ease: 'linear' }}
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
        const serving = ALL_USERS.some((u) => routes[u].region === r);
        const role = mode === 'passive' ? (primary === r ? 'primary' : r === 'eu' ? 'standby' : r === 'us' ? 'old primary' : '') : '';
        const cls = isDead ? 'dead' : serving ? 'serving' : inUse.includes(r) ? 'standby' : 'unused';
        return (
          <g key={r} className={`mr-region ${cls}`} onClick={() => onToggleRegion(r)}>
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
            <rect x={R.x - REGION_HALF} y={R.y - REGION_HALF} width={REGION_HALF * 2} height={REGION_HALF * 2} rx={8} />
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
            <g transform={`translate(${U.x}, ${U.y + LAT_LABEL.dy})`}>
              <rect x={-LAT_LABEL.w / 2} y={-12} width={LAT_LABEL.w} height={LAT_LABEL.h} rx={LAT_LABEL.h / 2} className="mr-lat" />
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
          <rect x={PHASE_PILL.x} y={PHASE_PILL.y} width={PHASE_PILL.w} height={PHASE_PILL.h} rx={PHASE_PILL.h / 2} />
          <text x={PHASE_PILL.x + PHASE_PILL.w / 2} y={PHASE_PILL.y + 20} textAnchor="middle">
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
  );
}
