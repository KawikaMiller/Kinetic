import type { KeyboardEvent } from 'react';
import { TravelDot } from '../../components/scene';
import type { Pt } from '../../core/geometry';
import { IO_R, XOR_BACK_PATH, gateBodyPath, wirePath, wirePoints, wiresOf, type BoardLayout } from './layout';
import { depthOf, type Circuit, type GateType } from './model';

/** Seconds a signal takes to cross one wire when it flows. */
const HOP_S = 0.35;

const bit = (v: boolean) => (v ? 1 : 0);

/** A gate circuit: clickable input switches, gates and output lamps, wires lit when high. */
export function Board({
  circuit, layout, values, pulse, onFlip,
}: {
  circuit: Circuit;
  layout: BoardLayout;
  values: Record<string, boolean>;
  /** Bumped on every input change so the high wires replay their pulse. */
  pulse: number;
  onFlip: (input: string) => void;
}) {
  const wires = wiresOf(circuit, layout);
  const depth = depthOf(circuit);
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="aa-svg" role="img" aria-label="Adder circuit">
      {wires.map((w) => (
        <path key={w.key} d={wirePath(w.start, w.end)} className={`aa-wire ${values[w.from] ? 'is-high' : 'is-low'}`} />
      ))}
      {pulse > 0 &&
        wires
          .filter((w) => values[w.from])
          .map((w) => (
            <TravelDot key={`${pulse}-${w.key}`} path={wirePoints(w.start, w.end)} color="var(--hi)" r={4} duration={HOP_S} delay={depth[w.from] * HOP_S} className="aa-dot" />
          ))}
      {/* Inputs first: DOM order is Tab order, and it should follow the drawing left to right. */}
      {circuit.inputs.map((name) => (
        <InputSwitch key={name} name={name} at={layout.at[name]} on={values[name]} onFlip={() => onFlip(name)} />
      ))}
      {circuit.gates.map((g) => (
        <GateShape key={g.id} type={g.type} at={layout.at[g.id]} on={values[g.id]} />
      ))}
      {circuit.outputs.map((o, i) => (
        <g key={o.label} className={`aa-lamp ${values[o.from] ? 'is-on' : ''}`}>
          <circle cx={layout.outputs[i].x} cy={layout.outputs[i].y} r={IO_R} />
          <text x={layout.outputs[i].x} y={layout.outputs[i].y + 5} textAnchor="middle" className="aa-io-value">{bit(values[o.from])}</text>
          <text x={layout.outputs[i].x} y={layout.outputs[i].y + IO_R + 16} textAnchor="middle" className="aa-io-name">{o.label}</text>
        </g>
      ))}
    </svg>
  );
}

function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

function InputSwitch({ name, at, on, onFlip }: { name: string; at: Pt; on: boolean; onFlip: () => void }) {
  return (
    <g
      className={`aa-input ${on ? 'is-on' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`Input ${name}, ${on ? 'high' : 'low'}`}
      onClick={onFlip}
      onKeyDown={onActivate(onFlip)}
    >
      <circle cx={at.x} cy={at.y} r={IO_R} />
      <text x={at.x} y={at.y + 5} textAnchor="middle" className="aa-io-value">{bit(on)}</text>
      <text x={at.x} y={at.y - IO_R - 8} textAnchor="middle" className="aa-io-name">{name}</text>
    </g>
  );
}

function GateShape({ type, at, on }: { type: GateType; at: Pt; on: boolean }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`} className={`aa-gate ${on ? 'is-on' : ''}`}>
      {type === 'XOR' && <path d={XOR_BACK_PATH} className="aa-gate-back" />}
      <path d={gateBodyPath(type)} className="aa-gate-body" />
      <text x={-4} y={4} textAnchor="middle" className="aa-gate-type">{type}</text>
    </g>
  );
}
