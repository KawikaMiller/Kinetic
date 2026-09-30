import { motion } from 'motion/react';
import { KEYS, SERVER_COLORS } from './model';

// Bucket layout (SVG units)
const W = 440;
const TOP = 70;
const DOT_STEP = 13;
const MIN_COL_H = 160;

export function Buckets({
  servers, owners, hover, setHover, moved, version,
}: {
  servers: string[];
  owners: string[];
  hover: number | null;
  setHover: (i: number | null) => void;
  moved: Set<number>;
  version: number;
}) {
  const colW = (W - 20) / servers.length;
  const perRow = Math.max(2, Math.floor((colW - 12) / DOT_STEP));
  const slot = new Map<number, { x: number; y: number }>();
  let tallest = 0;
  servers.forEach((s, c) => {
    let n = 0;
    KEYS.forEach((k) => {
      if (owners[k.i] !== s) return;
      slot.set(k.i, { x: 10 + c * colW + 12 + (n % perRow) * DOT_STEP, y: TOP + 16 + Math.floor(n / perRow) * DOT_STEP });
      n++;
    });
    tallest = Math.max(tallest, Math.ceil(n / perRow));
  });
  const colH = Math.max(MIN_COL_H, tallest * DOT_STEP + 30);

  return (
    <svg viewBox="0 0 440 430" className="ch-svg">
      {servers.map((s, c) => (
        <g key={s}>
          <rect x={10 + c * colW + 3} y={TOP - 6} width={colW - 6} height={colH} rx={10} fill="var(--cell)" stroke={SERVER_COLORS[s]} strokeOpacity={0.5} />
          <text x={10 + c * colW + colW / 2} y={TOP - 22} textAnchor="middle" fill={SERVER_COLORS[s]} className="ch-point-label">
            {s}
          </text>
          <text x={10 + c * colW + colW / 2} y={TOP - 40} textAnchor="middle" className="ch-center-sub">
            % {servers.length} = {c}
          </text>
        </g>
      ))}
      {KEYS.map((k) => {
        const p = slot.get(k.i)!;
        const isMoved = moved.has(k.i);
        return (
          <motion.circle
            key={k.i}
            r={hover === k.i ? 6 : 4.5}
            initial={false}
            animate={{ cx: p.x, cy: p.y }}
            transition={{ type: 'spring', stiffness: 90, damping: 16, delay: isMoved ? (k.i % 20) * 0.02 : 0 }}
            className={`ch-key ${isMoved ? `moved v${version % 2}` : ''}`}
            style={{ fill: SERVER_COLORS[owners[k.i]] }}
            onMouseEnter={() => setHover(k.i)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}
    </svg>
  );
}
