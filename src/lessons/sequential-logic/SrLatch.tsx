import { GateGlyph, GateInput, GateLamp, GateWire, IO_R, PORT_DY, inputPort, outputPort, type WireState } from '../../components/scene';
import type { Bit } from '../../core/bits';
import type { SrState, SrStatus } from './model';

const TOP = { x: 230, y: 80 };
const BOTTOM = { x: 230, y: 180 };
const OUT_X = outputPort('NOR', TOP).x;
const BACK_X = inputPort('NOR', TOP, 0).x;
const SWITCH_X = 40;
const LAMP_X = 420;
/** Feedback wires: out past the gate, then diagonally across to the other gate's back. */
const LOOP_OUT = 20;
const LOOP_DROP = 32;
const LOOP_BACK = 30;

/**
 * Two cross-coupled NOR gates: the top one makes Q from R and Q̄, the bottom one makes Q̄ from
 * S and Q. Each output wire loops back into the other gate, and that loop is the memory.
 */
export function SrLatch({ s, r, state, status, onFlip }: { s: Bit; r: Bit; state: SrState; status: SrStatus; onFlip: (input: 'S' | 'R') => void }) {
  const unknown = status === 'unpredictable';
  const broken = status === 'invalid' || unknown;
  const wire = (v: Bit): WireState => (unknown ? 'unknown' : v ? 'high' : 'low');
  const qBackPath = `M ${OUT_X} ${TOP.y} H ${OUT_X + LOOP_OUT} V ${TOP.y + LOOP_DROP} L ${BACK_X - LOOP_BACK} ${BOTTOM.y - LOOP_BACK} V ${BOTTOM.y - PORT_DY} H ${BACK_X}`;
  const qBarBackPath = `M ${OUT_X} ${BOTTOM.y} H ${OUT_X + LOOP_OUT} V ${BOTTOM.y - LOOP_DROP} L ${BACK_X - LOOP_BACK} ${TOP.y + LOOP_BACK} V ${TOP.y + PORT_DY} H ${BACK_X}`;
  const switchEdge = SWITCH_X + IO_R;
  return (
    <svg viewBox="0 0 480 260" className="sq-svg" role="img" aria-label={`SR latch: Q = ${unknown ? 'unknown' : state.q}`}>
      <GateWire d={`M ${switchEdge} ${TOP.y - PORT_DY} H ${BACK_X}`} state={wire(r)} />
      <GateWire d={`M ${switchEdge} ${BOTTOM.y + PORT_DY} H ${BACK_X}`} state={wire(s)} />
      <GateWire d={qBackPath} state={wire(state.q)} />
      <GateWire d={qBarBackPath} state={wire(state.qBar)} />
      <GateWire d={`M ${OUT_X} ${TOP.y} H ${LAMP_X - IO_R}`} state={wire(state.q)} />
      <GateWire d={`M ${OUT_X} ${BOTTOM.y} H ${LAMP_X - IO_R}`} state={wire(state.qBar)} />
      {/* Inputs first: DOM order is Tab order. R is drawn on top, beside the gate it feeds. */}
      <GateInput name="R" at={{ x: SWITCH_X, y: TOP.y - PORT_DY }} on={r === 1} onFlip={() => onFlip('R')} />
      <GateInput name="S" at={{ x: SWITCH_X, y: BOTTOM.y + PORT_DY }} on={s === 1} onFlip={() => onFlip('S')} />
      {[TOP, BOTTOM].map((at, k) => (
        <GateGlyph key={k} type="NOR" at={at} on={(k === 0 ? state.q : state.qBar) === 1 && !unknown} />
      ))}
      <GateLamp label="Q" at={{ x: LAMP_X, y: TOP.y }} value={unknown ? '?' : state.q} className={`is-stored ${broken ? 'is-broken' : ''}`} />
      <GateLamp label="Q̄" at={{ x: LAMP_X, y: BOTTOM.y }} value={unknown ? '?' : state.qBar} className={broken ? 'is-broken' : ''} />
    </svg>
  );
}
