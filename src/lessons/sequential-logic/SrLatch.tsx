import type { KeyboardEvent } from 'react';
import type { Bit } from '../../core/bits';
import type { SrState, SrStatus } from './model';

const IO_R = 18;
/** NOR outline (an OR body), centred on (0, 0); its inversion bubble sits just past the tip. Same glyph style as logic-gates. */
const NOR_BODY = 'M -28 -22 Q -14 0 -28 22 Q 6 22 24 0 Q 6 -22 -28 -22 Z';
const BUBBLE = { x: 28, r: 4 };
const TOP = { x: 230, y: 80 };
const BOTTOM = { x: 230, y: 180 };
const OUT_X = TOP.x + BUBBLE.x + BUBBLE.r;
const PORT_DY = 11;
const BACK_X = TOP.x - 23;
const LAMP_X = 420;

/**
 * Two cross-coupled NOR gates: the top one makes Q from R and Q̄, the bottom one makes Q̄ from
 * S and Q. Each output wire loops back into the other gate, and that loop is the memory.
 */
export function SrLatch({ s, r, state, status, onFlip }: { s: Bit; r: Bit; state: SrState; status: SrStatus; onFlip: (input: 'S' | 'R') => void }) {
  const unknown = status === 'unpredictable';
  const broken = status === 'invalid' || unknown;
  const wire = (v: Bit) => `sq-wire ${unknown ? 'is-unknown' : v ? 'is-high' : 'is-low'}`;
  const qBackPath = `M ${OUT_X} ${TOP.y} H ${OUT_X + 20} V ${TOP.y + 32} L ${BACK_X - 30} ${BOTTOM.y - 30} V ${BOTTOM.y - PORT_DY} H ${BACK_X}`;
  const qBarBackPath = `M ${OUT_X} ${BOTTOM.y} H ${OUT_X + 20} V ${BOTTOM.y - 32} L ${BACK_X - 30} ${TOP.y + 30} V ${TOP.y + PORT_DY} H ${BACK_X}`;
  return (
    <svg viewBox="0 0 480 260" className="sq-svg" role="img" aria-label={`SR latch: Q = ${unknown ? 'unknown' : state.q}`}>
      <path d={`M ${58} ${TOP.y - PORT_DY} H ${BACK_X}`} className={wire(r)} />
      <path d={`M ${58} ${BOTTOM.y + PORT_DY} H ${BACK_X}`} className={wire(s)} />
      <path d={qBackPath} className={wire(state.q)} />
      <path d={qBarBackPath} className={wire(state.qBar)} />
      <path d={`M ${OUT_X} ${TOP.y} H ${LAMP_X - IO_R}`} className={wire(state.q)} />
      <path d={`M ${OUT_X} ${BOTTOM.y} H ${LAMP_X - IO_R}`} className={wire(state.qBar)} />
      {/* Inputs first: DOM order is Tab order. R is drawn on top, beside the gate it feeds. */}
      <Switch name="R" at={{ x: 40, y: TOP.y - PORT_DY }} on={r} onFlip={() => onFlip('R')} />
      <Switch name="S" at={{ x: 40, y: BOTTOM.y + PORT_DY }} on={s} onFlip={() => onFlip('S')} />
      {[TOP, BOTTOM].map((at, k) => (
        <g key={k} transform={`translate(${at.x} ${at.y})`} className={`sq-gate ${(k === 0 ? state.q : state.qBar) && !unknown ? 'is-on' : ''}`}>
          <path d={NOR_BODY} className="sq-gate-body" />
          <circle cx={BUBBLE.x} cy={0} r={BUBBLE.r} className="sq-gate-body" />
          <text x={-4} y={4} textAnchor="middle" className="sq-gate-type">NOR</text>
        </g>
      ))}
      <Lamp label="Q" at={{ x: LAMP_X, y: TOP.y }} value={unknown ? '?' : state.q} stored broken={broken} />
      <Lamp label="Q̄" at={{ x: LAMP_X, y: BOTTOM.y }} value={unknown ? '?' : state.qBar} broken={broken} />
    </svg>
  );
}

function Switch({ name, at, on, onFlip }: { name: string; at: { x: number; y: number }; on: Bit; onFlip: () => void }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onFlip();
    }
  };
  return (
    <g className={`sq-input ${on ? 'is-on' : ''}`} role="button" tabIndex={0} aria-pressed={on === 1} aria-label={`Input ${name}, ${on ? 'high' : 'low'}`} onClick={onFlip} onKeyDown={onKey}>
      <circle cx={at.x} cy={at.y} r={IO_R} />
      <text x={at.x} y={at.y + 5} textAnchor="middle" className="sq-io-value">{on}</text>
      <text x={at.x} y={at.y - IO_R - 8} textAnchor="middle" className="sq-io-name">{name}</text>
    </g>
  );
}

function Lamp({ label, at, value, stored = false, broken }: { label: string; at: { x: number; y: number }; value: Bit | '?'; stored?: boolean; broken: boolean }) {
  return (
    <g className={`sq-lamp ${value === 1 ? 'is-on' : ''} ${stored ? 'is-stored' : ''} ${broken ? 'is-broken' : ''}`}>
      <circle cx={at.x} cy={at.y} r={IO_R} />
      <text x={at.x} y={at.y + 5} textAnchor="middle" className="sq-io-value">{value}</text>
      <text x={at.x} y={at.y + IO_R + 16} textAnchor="middle" className="sq-io-name">{label}</text>
    </g>
  );
}
