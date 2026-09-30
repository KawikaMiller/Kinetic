import type { ReactNode } from 'react';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { SLOT, slotValueRect } from './geometry';

/**
 * A named variable: a name tag and a value box (a stack slot, a local, a binding
 * in an environment). SVG, positioned by its top-left corner `at`.
 *
 * - `value` prints a primitive. `isRef` draws a dot where a reference arrow leaves
 *   instead (put a RefArrow from `slotPort(at)`).
 * - `highlight` rings the slot in its tone ("this name sees the mutation").
 * - `dead` dims it: the frame that owned it has returned.
 */
export function VarSlot({
  at, name, value, isRef = false, tone = 'info', highlight = false, dead = false, w = SLOT.w, h = SLOT.h, nameW = SLOT.nameW,
  className = '',
}: {
  at: Pt;
  name: ReactNode;
  value?: ReactNode;
  isRef?: boolean;
  tone?: Tone;
  highlight?: boolean;
  dead?: boolean;
  w?: number;
  h?: number;
  nameW?: number;
  className?: string;
}) {
  const box = slotValueRect(at, { w, h, nameW });
  const cls = `var-slot tone-${tone} ${highlight ? 'is-highlight' : ''} ${dead ? 'is-dead' : ''} ${className}`;
  return (
    <g className={cls}>
      <rect className="var-slot-name-box" x={at.x} y={at.y} width={nameW} height={h} rx={7} />
      <text className="var-slot-name" x={at.x + nameW / 2} y={at.y + h / 2 + 4} textAnchor="middle">
        {name}
      </text>
      <rect className="var-slot-value-box" x={box.x} y={box.y} width={box.w} height={box.h} rx={7} />
      {isRef ? (
        <circle className="var-slot-port" cx={box.x + box.w / 2} cy={box.y + box.h / 2} r={4} />
      ) : (
        <text className="var-slot-value" x={box.x + box.w / 2} y={box.y + box.h / 2 + 4} textAnchor="middle">
          {value}
        </text>
      )}
    </g>
  );
}
