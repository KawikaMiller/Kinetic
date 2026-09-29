import type { ButtonHTMLAttributes, ReactNode } from 'react';

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

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/** Pill-style single choice. Good for picking an algorithm or mode. */
export function Segmented<T extends string>({
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
