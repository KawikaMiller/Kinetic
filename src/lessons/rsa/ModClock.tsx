import { motion } from 'motion/react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { SPRING } from '../../core/motion';
import { clockPoint, CLOCK } from './clock';
import { group } from './frames';

export interface ClockMark {
  value: bigint;
  label: string;
  tone: 'hi' | 'orange' | 'ok';
}

/**
 * The numbers 0 … n − 1 around a circle: m^e mod n jumps from m to c, and c^d mod n jumps
 * back. The arrow is the exponentiation; the position is the remainder.
 */
export function ModClock({ n, from, to, arrow }: {
  n: bigint;
  from: ClockMark | null;
  to: ClockMark | null;
  arrow: { label: string; tone: 'info' | 'violet' } | null;
}) {
  const marker = useArrowMarker(arrow ? `var(--${arrow.tone})` : 'var(--muted)', { size: 7, refX: 9 });
  const { size, r } = CLOCK;
  const c = size / 2;
  const a = from && clockPoint(from.value, n);
  const b = to && clockPoint(to.value, n);
  const zero = clockPoint(0n, n);
  return (
    <svg className="rsa-clock" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Clock of the numbers 0 to ${group(n - 1n)}${from ? `, ${from.label}` : ''}${to ? ` to ${to.label}` : ''}`}>
      {marker.def}
      <circle className="rsa-clock-ring" cx={c} cy={c} r={r} />
      <circle className="rsa-clock-tick" cx={zero.x} cy={zero.y} r={3} />
      <text className="rsa-clock-zero" x={c} y={c - r + 18}>0</text>
      <text className="rsa-clock-n" x={c} y={c - 4}>mod {group(n)}</text>
      <text className="rsa-clock-sub" x={c} y={c + 13}>{group(n)} positions</text>
      {a && b && arrow && (
        <motion.path
          key={`${from!.value}-${to!.value}`}
          className={`rsa-clock-arrow tone-${arrow.tone}`}
          d={`M ${a.x} ${a.y} Q ${c + (a.x + b.x - 2 * c) * 0.15} ${c + (a.y + b.y - 2 * c) * 0.15} ${b.x} ${b.y}`}
          markerEnd={marker.url}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {arrow && a && b && (
        <text className={`rsa-clock-op tone-${arrow.tone}`} x={c} y={c + 34}>{arrow.label}</text>
      )}
      {[from, to].map((mk, i) => {
        if (!mk) return null;
        const p = clockPoint(mk.value, n);
        const out = clockPoint(mk.value, n, CLOCK.labelR);
        return (
          <g key={i} className={`rsa-clock-mark tone-${mk.tone}`}>
            <motion.circle initial={{ cx: p.x, cy: p.y }} animate={{ cx: p.x, cy: p.y }} transition={SPRING.soft} r={7} />
            <motion.text initial={{ x: out.x, y: out.y + 4 }} animate={{ x: out.x, y: out.y + 4 }} transition={SPRING.soft}>{mk.label}</motion.text>
          </g>
        );
      })}
    </svg>
  );
}
