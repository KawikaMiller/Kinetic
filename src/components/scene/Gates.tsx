import type { KeyboardEvent, ReactNode, SVGProps } from 'react';
import type { Pt } from '../../core/geometry';
import { BUBBLE_R, IO_R, XOR_BACK_PATH, bubbleAt, gateBodyPath, typeLabelX, wirePath, type GateKind } from './gateGeometry';

const VALUE_DY = 5;
const NAME_ABOVE = 8;
const NAME_BELOW = 16;

/**
 * A logic gate's standard symbol at `at`, lit (`is-on`) when its output is 1. Extra props
 * (role, tabIndex, handlers) go on the group, so a lesson can make a gate a button;
 * `children` draws extras in the gate's own coordinates (a slot name above it).
 */
export function GateGlyph({
  type, at, on, className = '', children, ...rest
}: { type: GateKind; at: Pt; on: boolean; className?: string; children?: ReactNode } & Omit<SVGProps<SVGGElement>, 'type'>) {
  const bubble = bubbleAt(type);
  return (
    <g transform={`translate(${at.x} ${at.y})`} className={`gate ${on ? 'is-on' : ''} ${className}`} {...rest}>
      {type === 'XOR' && <path d={XOR_BACK_PATH} className="gate-back" />}
      <path d={gateBodyPath(type)} className="gate-body" />
      {bubble && <circle cx={bubble.x} cy={bubble.y} r={BUBBLE_R} className="gate-body" />}
      <text x={typeLabelX(type)} y={4} textAnchor="middle" className="gate-type">
        {type}
      </text>
      {children}
    </g>
  );
}

export type WireState = 'high' | 'low' | 'unknown' | 'unused';

/** A wire, coloured by its signal: high, low, unknown (an invalid latch) or unused. */
export function GateWire({ d, state }: { d: string; state: WireState }) {
  return <path d={d} className={`gate-wire is-${state}`} />;
}

/** The S-shaped wire between two ports. */
export function SWire({ from, to, state }: { from: Pt; to: Pt; state: WireState }) {
  return <GateWire d={wirePath(from, to)} state={state} />;
}

const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

/** A clickable input switch showing 0 or 1, named above. Space/Enter flips it from the keyboard. */
export function GateInput({ name, at, on, onFlip }: { name: string; at: Pt; on: boolean; onFlip: () => void }) {
  return (
    <g
      className={`gate-input ${on ? 'is-on' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`Input ${name}, ${on ? 'high' : 'low'}`}
      onClick={onFlip}
      onKeyDown={onActivate(onFlip)}
    >
      <circle cx={at.x} cy={at.y} r={IO_R} />
      <text x={at.x} y={at.y + VALUE_DY} textAnchor="middle" className="gate-io-value">
        {on ? 1 : 0}
      </text>
      <text x={at.x} y={at.y - IO_R - NAME_ABOVE} textAnchor="middle" className="gate-io-name">
        {name}
      </text>
    </g>
  );
}

/** An output lamp showing its value (or '?'), labelled below; lit when the value is 1. */
export function GateLamp({ label, at, value, className = '' }: { label: ReactNode; at: Pt; value: 0 | 1 | '?'; className?: string }) {
  return (
    <g className={`gate-lamp ${value === 1 ? 'is-on' : ''} ${className}`}>
      <circle cx={at.x} cy={at.y} r={IO_R} />
      <text x={at.x} y={at.y + VALUE_DY} textAnchor="middle" className="gate-io-value">
        {value}
      </text>
      <text x={at.x} y={at.y + IO_R + NAME_BELOW} textAnchor="middle" className="gate-io-name">
        {label}
      </text>
    </g>
  );
}
