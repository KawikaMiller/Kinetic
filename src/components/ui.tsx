import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Option } from './options';

/** Row of lesson-specific controls under the transport bar. */
export function Controls({ children }: { children: ReactNode }) {
  return <div className="controls">{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' };

export function Button({ variant = 'ghost', className = '', ...rest }: ButtonProps) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...rest} />;
}

export function Slider({
  label, value, min, max, step = 1, onChange, format = String,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="slider">
      <span className="slider-label">
        {label} <b>{format(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export type { Option } from './options';

/** Pill-style single choice. Good for picking an algorithm, a mode, or a small number. */
export function Segmented<T extends string | number>({
  options, value, onChange, label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {label && <span className="segmented-label">{label}</span>}
      <div className="segmented-track">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An on/off choice, drawn as a two-option Segmented. The "off" option always comes first. */
export function Toggle({
  label, value, onChange, off = 'Off', on = 'On',
}: {
  label?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  off?: ReactNode;
  on?: ReactNode;
}) {
  return (
    <Segmented
      label={label}
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
      options={[
        { value: 'off', label: off },
        { value: 'on', label: on },
      ]}
    />
  );
}

/** Single-line text or number input with the shared look. Enter does nothing unless you pass onEnter. */
export function TextField({
  label, value, onChange, onEnter, sanitize, type = 'text', min, max, width, maxLength, placeholder, disabled, ariaLabel,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  /** Clean the raw input before onChange, e.g. letters only. */
  sanitize?: (raw: string) => string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  width?: number | string;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <label className="text-field">
      {label && <span>{label}</span>}
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        style={width !== undefined ? { width } : undefined}
        onChange={(e) => onChange(sanitize ? sanitize(e.target.value) : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </label>
  );
}

/** A label over a tight group of controls: preset buttons, palettes, role pickers. */
export function ControlGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="control-group">
      {label && <span className="control-group-label">{label}</span>}
      <div className="control-group-items">{children}</div>
    </div>
  );
}

/** Faint explanatory text inside a controls row. */
export function Hint({ children }: { children: ReactNode }) {
  return <span className="hint">{children}</span>;
}

/** The ▶ Resume / ❚❚ Pause button every live simulation has. */
export function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return <Button onClick={onToggle}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>;
}

/** Colour key for whatever the stage is drawing. */
export function Legend({ items }: { items: { color: string; label: ReactNode; shape?: 'dot' | 'square' | 'line' }[] }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i} className="legend-item">
          <i className={`swatch swatch-${it.shape ?? 'square'}`} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** A big live number: comparisons, hits, requests/sec... */
export function Stat({ label, value, color, sub }: { label: string; value: ReactNode; color?: string; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="stats">{children}</div>;
}
