import type { CSSProperties, ReactNode } from 'react';

/** A sub-panel inside a stage (kit.css `.box`). Pass className for lesson layout, style for one-off fills. */
export function Box({
  variant = 'default', className = '', style, children,
}: {
  variant?: 'default' | 'sunken' | 'raised';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const v = variant === 'default' ? '' : ` box-${variant}`;
  return (
    <div className={`box${v} ${className}`} style={style}>
      {children}
    </div>
  );
}

export type TitleWeight = 'bold' | 'regular';

/**
 * Small uppercase heading inside a panel, with an optional faint lower-case hint after it.
 * `weight="regular"` is the lighter label style (normal weight, tighter tracking).
 */
export function SectionTitle({
  children, hint, weight = 'bold', className = '',
}: {
  children: ReactNode;
  hint?: ReactNode;
  weight?: TitleWeight;
  className?: string;
}) {
  return (
    <span className={`section-title ${weight === 'regular' ? 'is-regular' : ''} ${className}`}>
      {children}
      {hint && <span className="hint-inline">{hint}</span>}
    </span>
  );
}

/**
 * A dashed tray that collects items (outputs, a call stack, extracted values). Shows
 * `empty` (as a faint mono note) when it has no children; pass your own element as a
 * child instead if the empty text needs the lesson's own styling.
 */
export function Tray({
  label, labelWeight, empty, className = '', ariaLabel, children,
}: {
  label?: ReactNode;
  labelWeight?: TitleWeight;
  empty?: ReactNode;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : children != null && children !== false;
  return (
    <div className={`tray ${className}`} aria-label={ariaLabel}>
      {label && <SectionTitle weight={labelWeight}>{label}</SectionTitle>}
      {hasItems ? children : empty && <span className="empty-note">{empty}</span>}
    </div>
  );
}
