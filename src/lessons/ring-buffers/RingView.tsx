import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { SPRING } from '../../core/motion';
import { headSlot, reservedSlot, tailSlot, type Ring } from './model';

const SIZE = 340;
const C = SIZE / 2;
const R = 92;
const SLOT_W = 34;
const SLOT_H = 26;
/** Slot numbers sit just outside the slots. */
const INDEX_R = R + 24;
/** Head points in from outside the numbers; tail points out from inside the ring. */
const HEAD_R = R + 48;
const TAIL_R = R - 30;

/** overwrite: the slot whose item was lost; drop: the new item, rejected at the tail. */
export type Flash = ({ kind: 'overwrite'; slot: number } | { kind: 'drop' }) & {
  /** Changes every time, so the same thing can flash twice in a row. */
  key: number;
};

const angleOf = (slot: number, n: number) => (slot / n) * 360 - 90;
const at = (deg: number, r: number) => ({ x: C + r * Math.cos((deg * Math.PI) / 180), y: C + r * Math.sin((deg * Math.PI) / 180) });

/**
 * The array drawn as a ring. Pointer angles come from their total moves (never wrapped),
 * so passing slot N − 1 → 0 keeps turning the same way instead of spinning back.
 */
export function RingView({ ring, headBase, tailBase, flash }: { ring: Ring; headBase: number; tailBase: number; flash: Flash | null }) {
  const n = ring.n;
  const reserved = reservedSlot(ring);
  const step = 360 / n;
  const headDeg = (headBase + ring.headMoves) * step - 90;
  const tailDeg = (tailBase + ring.tailMoves) * step - 90;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rb-ring" role="img" aria-label={`Ring of ${n} slots; head at slot ${headSlot(ring)}, tail at slot ${tailSlot(ring)}`}>
      <circle cx={C} cy={C} r={R} className="rb-ring-track" />
      {ring.slots.map((v, i) => {
        const deg = angleOf(i, n);
        const p = at(deg, R);
        const cls = v !== null ? 'is-filled' : i === reserved ? 'is-reserved' : 'is-empty';
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${deg + 90})`}>
            <rect x={-SLOT_W / 2} y={-SLOT_H / 2} width={SLOT_W} height={SLOT_H} rx={6} className={`rb-slot ${cls}`} />
            {flash?.kind === 'overwrite' && flash.slot === i && (
              <motion.rect
                key={flash.key}
                x={-SLOT_W / 2}
                y={-SLOT_H / 2}
                width={SLOT_W}
                height={SLOT_H}
                rx={6}
                className="rb-flash tone-orange"
                initial={{ opacity: 0.95 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 1.1 }}
              />
            )}
            <text y={4} textAnchor="middle" transform={`rotate(${-(deg + 90)})`} className="rb-slot-text">
              {v ?? ''}
            </text>
          </g>
        );
      })}
      {ring.slots.map((_, i) => {
        const p = at(angleOf(i, n), INDEX_R);
        return (
          <text key={`i${i}`} x={p.x} y={p.y + 3} textAnchor="middle" className="rb-index">
            {i}
          </text>
        );
      })}
      {flash?.kind === 'drop' && (
        <motion.g key={flash.key} className="rb-drop tone-bad" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1 }}>
          <circle cx={at(tailDeg, TAIL_R - 26).x} cy={at(tailDeg, TAIL_R - 26).y} r={11} />
          <text x={at(tailDeg, TAIL_R - 26).x} y={at(tailDeg, TAIL_R - 26).y + 4} textAnchor="middle">
            ×
          </text>
        </motion.g>
      )}
      <Pointer deg={headDeg} r={HEAD_R} label="head" tone="info" outward />
      <Pointer deg={tailDeg} r={TAIL_R} label="tail" tone="violet" />
    </svg>
  );
}

function Pointer({ deg, r, label, tone, outward = false }: { deg: number; r: number; label: string; tone: string; outward?: boolean }) {
  // The angle springs; the arrow and its upright label are placed from it every frame.
  const angle = useSpring(deg, { stiffness: SPRING.snappy.stiffness, damping: SPRING.snappy.damping });
  useEffect(() => {
    angle.set(deg);
  }, [angle, deg]);
  const tipR = outward ? r - 12 : r + 12;
  const baseR = outward ? r + 2 : r - 2;
  const points = useTransform(angle, (d) => {
    const tip = at(d, tipR);
    const side = (s: number) => at(d + (s * 7 * 180) / (Math.PI * baseR), baseR);
    const [a, b] = [side(-1), side(1)];
    return `${tip.x},${tip.y} ${a.x},${a.y} ${b.x},${b.y}`;
  });
  const labelR = outward ? r + 14 : r - 14;
  const x = useTransform(angle, (d) => at(d, labelR).x);
  const y = useTransform(angle, (d) => at(d, labelR).y + 4);
  return (
    <g className={`rb-pointer tone-${tone}`}>
      <motion.polygon points={points} />
      <motion.text x={x} y={y} textAnchor="middle">
        {label}
      </motion.text>
    </g>
  );
}
