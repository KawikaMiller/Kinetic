import { motion } from 'motion/react';
import { ringOwner, type Point } from './hash';
import { KEYS, SERVER_COLORS } from './model';

// Ring geometry (SVG units)
const CX = 220;
const CY = 215;
const R = 172;
/** Moved-key trails are only drawn when few enough keys moved to stay readable. */
const MAX_TRAILS = 40;
/** With this many points per server or fewer, points get big markers and every label. */
const BIG_POINTS_MAX = 3;

const angle = (pos: number) => pos * Math.PI * 2 - Math.PI / 2;
const at = (pos: number, r: number) => ({ x: CX + Math.cos(angle(pos)) * r, y: CY + Math.sin(angle(pos)) * r });

function arcPath(from: number, to: number, r: number) {
  let span = to - from;
  if (span <= 0) span += 1;
  const a = at(from, r);
  const b = at(from + span, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function Ring({
  pts, owners, vnodes, hover, setHover, moved, version, onServer,
}: {
  pts: Point[];
  owners: string[];
  vnodes: number;
  hover: number | null;
  setHover: (i: number | null) => void;
  moved: Set<number>;
  version: number;
  onServer: (s: string) => void;
}) {
  const hk = hover !== null ? KEYS[hover] : null;
  const hOwner = hk ? ringOwner(pts, hk.pos) : null;
  const big = vnodes <= BIG_POINTS_MAX;

  return (
    <svg viewBox="0 0 440 430" className="ch-svg">
      {/* ownership arcs: each point owns the stretch counter-clockwise back to the previous point */}
      {pts.map((p, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        return (
          <path
            key={`${p.server}-${p.pos}`}
            d={pts.length === 1 ? arcPath(p.pos, p.pos + 0.9999, R) : arcPath(prev.pos, p.pos, R)}
            stroke={SERVER_COLORS[p.server]}
            strokeWidth={10}
            strokeOpacity={0.55}
            fill="none"
          />
        );
      })}

      {/* hovered key's clockwise walk to its owner */}
      {hk && hOwner && (
        <motion.path
          key={hover}
          d={arcPath(hk.pos, hOwner.pos === hk.pos ? hk.pos + 0.0001 : hOwner.pos, R - 30)}
          stroke="var(--hi)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      )}

      {/* keys that just changed owner walk clockwise to their new server */}
      {moved.size <= MAX_TRAILS &&
        [...moved].map((i) => {
          const k = KEYS[i];
          const o = ringOwner(pts, k.pos);
          return (
            <motion.path
              key={`mv-${version}-${i}`}
              d={arcPath(k.pos, o.pos, R - 30 - (i % 4) * 4)}
              stroke={SERVER_COLORS[o.server]}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: [1, 1, 0] }}
              transition={{ duration: 1.8, ease: 'easeOut', delay: (i % 10) * 0.04 }}
            />
          );
        })}

      {/* keys */}
      {KEYS.map((k) => {
        const r = R - 24 - (k.i % 4) * 9;
        const p = at(k.pos, r);
        const isMoved = moved.has(k.i);
        return (
          <circle
            key={`${k.i}-${isMoved ? version : 0}`}
            cx={p.x}
            cy={p.y}
            r={hover === k.i ? 6 : 4}
            className={`ch-key ${isMoved ? 'moved' : ''}`}
            style={{ fill: SERVER_COLORS[owners[k.i]] }}
            onMouseEnter={() => setHover(k.i)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}

      {/* server points */}
      {pts.map((p) => {
        const o = at(p.pos, R);
        const lbl = at(p.pos, R + 22);
        const primary = p === pts.find((q) => q.server === p.server);
        return (
          <g key={`pt-${p.server}-${p.pos}`} className="ch-point" onClick={() => onServer(p.server)}>
            <circle cx={o.x} cy={o.y} r={big ? 9 : 4} fill="var(--bg-2)" stroke={SERVER_COLORS[p.server]} strokeWidth={big ? 3 : 2} />
            {(big || primary) && (
              <text x={lbl.x} y={lbl.y + 4} textAnchor="middle" fill={SERVER_COLORS[p.server]} className="ch-point-label">
                {p.server}
              </text>
            )}
          </g>
        );
      })}

      <text x={CX} y={CY - 6} textAnchor="middle" className="ch-center">
        hash ring
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" className="ch-center-sub">
        0 → 2³² clockwise
      </text>
    </svg>
  );
}
