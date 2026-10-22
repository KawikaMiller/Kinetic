import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { CLAIM_LABEL, PROVENANCE_LABEL, type ClaimKind, type ProvenanceKind } from '../core/provenance';
import type { Tone } from '../core/tone';
import type { Option } from './options';
import { useRadioGroup } from './useRadioGroup';

/** Row of lesson-specific controls under the transport bar. */
export function Controls({ children }: { children: ReactNode }) {
  return <div className="controls">{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  /** The <button> itself, e.g. to move focus back to it. */
  ref?: Ref<HTMLButtonElement>;
  /**
   * Unavailable but still focusable (`aria-disabled`, click ignored). Use it on a button the press itself can disable
   * (Undo, Clear, Push), so keyboard focus stays on it instead of falling to the page.
   */
  softDisabled?: boolean;
};

export function Button({ variant = 'ghost', className = '', softDisabled = false, onClick, ...rest }: ButtonProps) {
  return <button type="button" className={`btn btn-${variant} ${className}`} aria-disabled={softDisabled || undefined} onClick={softDisabled ? undefined : onClick} {...rest} />;
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
      {/* aria-valuetext: announce what the label shows ("no limit", "1.2/day"), not the raw number */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}


/** Pill-style single choice. Good for picking an algorithm, a mode, or a small number. */
export function Segmented<T extends string | number | boolean>({
  options, value, onChange, label, ariaLabel, ref,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  /** Names the radio group when the visible label lives elsewhere (e.g. in a sentence around it). */
  ariaLabel?: string;
  /** The radiogroup element (useScenePicker uses it to put focus back after a scene switch). */
  ref?: Ref<HTMLDivElement>;
}) {
  const radio = useRadioGroup(
    options.length,
    options.findIndex((o) => o.value === value),
    (i) => onChange(options[i].value),
  );
  return (
    <div ref={ref} className="segmented" role="radiogroup" aria-label={ariaLabel ?? label}>
      {label && <span className="segmented-label">{label}</span>}
      <div className="segmented-track">
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            type="button"
            {...radio.itemProps(i)}
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
  label, value, onChange, onEnter, onBlur, sanitize, type = 'text', min, max, width, maxLength, placeholder, disabled, ariaLabel,
  spellCheck, invalid, ariaDescribedBy, className = '',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  /** When the field loses focus: the place to normalise a half-typed value. */
  onBlur?: () => void;
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
  /** Off for code-like input (paths, JSON), so the browser doesn't underline it. */
  spellCheck?: boolean;
  /** Marks the current text as refused (aria-invalid), so a screen reader says so on the field itself. */
  invalid?: boolean;
  /** The id of the text that explains the field (a refusal message), as aria-describedby. */
  ariaDescribedBy?: string;
  /** Extra class on the wrapper, for lesson sizing (e.g. a wider body field). */
  className?: string;
}) {
  return (
    <label className={`text-field ${className}`}>
      {label && <span>{label}</span>}
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={spellCheck}
        aria-label={ariaLabel ?? label}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        style={width !== undefined ? { width } : undefined}
        onChange={(e) => onChange(sanitize ? sanitize(e.target.value) : e.target.value)}
        onBlur={onBlur}
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

/**
 * Multi-line text with the same look as TextField: a regex's test text, a JSON editor.
 * Monospace by default; Enter inserts a newline (there's no onEnter).
 */
export function TextArea({
  label, value, onChange, onBlur, sanitize, rows = 4, mono = true, placeholder, disabled, ariaLabel, spellCheck = false,
  className = '',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  sanitize?: (raw: string) => string;
  rows?: number;
  /** Off for prose. */
  mono?: boolean;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Off by default: this is usually code or data. */
  spellCheck?: boolean;
  className?: string;
}) {
  return (
    <label className={`text-field ${className}`}>
      {label && <span>{label}</span>}
      <textarea
        className={mono ? undefined : 'is-sans'}
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={spellCheck}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(sanitize ? sanitize(e.target.value) : e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}

/**
 * A label over a tight group of controls: preset buttons, palettes, role pickers.
 * `inline` puts the label to the left of the group instead of above it.
 */
export function ControlGroup({
  label, inline = false, className = '', children,
}: {
  label?: string;
  inline?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`control-group ${inline ? 'is-inline' : ''} ${className}`}>
      {label && <span className="control-group-label">{label}</span>}
      <div className="control-group-items">{children}</div>
    </div>
  );
}

/**
 * Explanatory text inside a controls row: faint by default, `muted` when it matters
 * more, `bad` for a refusal or error message (a rejected input: say why and what it keeps); `block` gives it a line of its own.
 */
export function Hint({
  tone = 'faint', block = false, className = '', id, children,
}: {
  tone?: 'faint' | 'muted' | 'bad';
  block?: boolean;
  className?: string;
  /** So a control can point at this text with riaDescribedBy. */
  id?: string;
  children: ReactNode;
}) {
  const classes = ['hint', tone === 'muted' && 'is-muted', tone === 'bad' && 'is-bad', block && 'is-block', className].filter(Boolean).join(' ');
  return <span id={id} className={classes}>{children}</span>;
}

/**
 * A chip you can press: one of a row of presets or examples ("#FF8800", "café", "NaN"),
 * a toggleable flag, or a small action ("+ grep", "×").
 *
 * - Pass `on` for a chip that has a state (the preset currently loaded, a flag that's set):
 *   it's announced as a toggle (aria-pressed). Leave `on` out for a plain action, which
 *   must not claim to be pressed or unpressed.
 * - `onStyle="solid"` fills an on chip with its tone, for picks that must read as an
 *   answer rather than a hover; the default `tint` matches the hover.
 */
export function ChipButton({
  tone = 'violet', on, onStyle = 'tint', size = 'sm', title, ariaLabel, ariaDescribedBy, disabled = false, softDisabled = false, className = '', onClick, children,
}: {
  tone?: Tone;
  on?: boolean;
  onStyle?: 'tint' | 'solid';
  /** md for word-sized labels next to a text field, sm for dense rows. */
  size?: 'sm' | 'md';
  title?: string;
  /** Accessible name when the label alone isn't enough (an icon like "×"). */
  ariaLabel?: string;
  /** The id of the text that explains this chip (why it is switched off); read after the name, unlike 	itle, which touch and keyboard users never see. */
  ariaDescribedBy?: string;
  /** Greyed out and not pressable (a sandbox that's full until Reset). */
  disabled?: boolean;
  /** Looks greyed out and ignores presses but stays focusable (`aria-disabled`): use it where a press can switch the chip off, so keyboard focus stays put. */
  softDisabled?: boolean;
  className?: string;
  /** Receives the click: `e.currentTarget` is the chip, for a handler that hands focus on when the press removes it. */
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const classes = [
    'chip', 'chip-button', `tone-${tone}`, size === 'md' && 'is-md', on && 'is-on', on && onStyle === 'solid' && 'is-solid', className,
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-pressed={on} aria-label={ariaLabel} aria-describedby={ariaDescribedBy} title={title} disabled={disabled} aria-disabled={softDisabled || undefined} onClick={softDisabled ? undefined : onClick}>
      {children}
    </button>
  );
}

/** The ▶ Resume / ❚❚ Pause button every live simulation has. */
export function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return <Button onClick={onToggle}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>;
}

// ---- Sortable table heading (K3-4): the order itself comes from the useSortedRows hook (components/useSortedRows.ts) ----
export { SortTh } from './SortTh';
// ---- end sortable table heading ----

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

/** A big live number: comparisons, hits, requests/sec... `children` render under it (e.g. a <Bar>). */
export function Stat({
  label, value, color, sub, className = '', children,
}: {
  /** Rendered uppercase: wrap Greek letters or case-sensitive names in <span className="keep-case">. */
  label: ReactNode;
  value: ReactNode;
  color?: string;
  /** A note under the value; an array draws one line each (every line wraps on a phone). */
  sub?: ReactNode | readonly ReactNode[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`stat ${className}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && (
        <span className="stat-sub">
          {Array.isArray(sub) ? sub.map((line, i) => <span key={i} className="stat-sub-line">{line}</span>) : sub}
        </span>
      )}
      {children}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="stats">{children}</div>;
}

// ── Provenance (K3-7, docs/tier3-plan.md AC-0/T3 #21) ───────────────────────

/**
 * Says what the learner is looking at, at the moment it matters: simulated, illustrative,
 * a toy, scripted, quoted from memory, shown without running it, an invented scenario, or the
 * real thing.
 * Always muted (never `--bad`/`--ok`: provenance is not a verdict); only `real` has a solid
 * border, the rest are dashed. `children` is the short note ("what EXPLAIN prints on Postgres"),
 * `seed` prints a seeded sim's seed. Every domain-reviewed Tier 3 lesson carries at least one.
 */
export function Provenance({
  kind, seed, children,
}: {
  kind: ProvenanceKind;
  seed?: number | string;
  children?: ReactNode;
}) {
  return (
    <span className={`chip provenance is-${kind}`} data-provenance={kind}>
      <b>{PROVENANCE_LABEL[kind]}</b>
      {children && <span className="provenance-note">{children}</span>}
      {seed !== undefined && <span className="provenance-seed">seed {seed}</span>}
    </span>
  );
}

/**
 * The row of `Provenance` (or `ClaimLabel`) chips under a stage's visual: wraps at any width,
 * with a small gap and a little room above. One row per stage, a chip for each thing the learner
 * should not take for real (the simulator, the scripted run, the made-up numbers).
 */
export function ProvenanceRow({ children }: { children: ReactNode }) {
  return <div className="provenance-row">{children}</div>;
}

/**
 * Says how much weight a sentence can bear: a `standard` (a spec, a convention someone wrote
 * down), a `research` finding (named and hedged), `practice` (what many teams do) or `view`
 * (one person's opinion). Non-technical lessons label every claim with one (AC-0/T3 #24).
 * `theorem` marks a theorem-shaped statement the lesson argues but does not run (AC-0/T4 #27);
 * `children` then names the result ("FLP: no deterministic protocol ...").
 * `children` is the short text ("Dunning 2002, from memory"); it is read out with the kind,
 * "research finding: Dunning 2002, from memory". Muted like Provenance, never a status colour.
 */
export function ClaimLabel({ kind, children }: { kind: ClaimKind; children?: ReactNode }) {
  const label = CLAIM_LABEL[kind];
  return (
    <span className={`chip claim-label is-${kind}`} data-claim={kind} role="note" aria-label={ariaText(label, children)}>
      <b aria-hidden="true">{label}</b>
      {children && <span className="provenance-note" aria-hidden="true">{children}</span>}
    </span>
  );
}

/** "kind: note" for an aria-label; a ReactNode note that isn't plain text reads as the kind alone. */
const ariaText = (label: string, note: ReactNode) =>
  typeof note === 'string' || typeof note === 'number' ? `${label}: ${note}` : label;
