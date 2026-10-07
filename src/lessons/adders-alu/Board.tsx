import { GateGlyph, GateInput, GateLamp, SWire, TravelDot, wirePoints, wiresOf } from '../../components/scene';
import type { BoardLayout } from './layout';
import { depthOf, type Circuit } from './model';

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
        <SWire key={w.key} from={w.start} to={w.end} state={values[w.from] ? 'high' : 'low'} />
      ))}
      {pulse > 0 &&
        wires
          .filter((w) => values[w.from])
          .map((w) => (
            <TravelDot key={`${pulse}-${w.key}`} path={wirePoints(w.start, w.end)} color="var(--hi)" r={4} duration={HOP_S} delay={depth[w.from] * HOP_S} className="gate-dot" />
          ))}
      {/* Inputs first: DOM order is Tab order, and it should follow the drawing left to right. */}
      {circuit.inputs.map((name) => (
        <GateInput key={name} name={name} at={layout.at[name]} on={values[name]} onFlip={() => onFlip(name)} />
      ))}
      {circuit.gates.map((g) => (
        <GateGlyph key={g.id} type={g.type} at={layout.at[g.id]} on={values[g.id]} />
      ))}
      {circuit.outputs.map((o, i) => (
        <GateLamp key={o.label} label={o.label} at={layout.outputs[i]} value={bit(values[o.from])} />
      ))}
    </svg>
  );
}
