import type { HTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Native attributes a wrapper forwards to its root element (aria-*, role, id, data-*, events).
 * Without forwarding, `<Box aria-label="…">` type-checks (TS doesn't check hyphenated JSX props
 * against the declared ones) and the attribute silently vanishes.
 */
type Forwarded<E extends HTMLElement> = Omit<HTMLAttributes<E>, 'children' | 'className'>;

/**
 * A sub-panel inside a stage (kit.css `.box`). Pass className for lesson layout, style for
 * one-off fills, `ref` to reach its div (measuring it, focusing it).
 */
export function Box({
  variant = 'default', className = '', children, ref, ...rest
}: {
  variant?: 'default' | 'sunken' | 'raised';
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
} & Forwarded<HTMLDivElement>) {
  const v = variant === 'default' ? '' : ` box-${variant}`;
  return (
    <div {...rest} ref={ref} className={`box${v} ${className}`}>
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
  children, hint, weight = 'bold', className = '', ...rest
}: {
  children: ReactNode;
  hint?: ReactNode;
  weight?: TitleWeight;
  className?: string;
} & Forwarded<HTMLSpanElement>) {
  return (
    <span {...rest} className={`section-title ${weight === 'regular' ? 'is-regular' : ''} ${className}`}>
      {children}
      {hint && <span className="hint-inline">{hint}</span>}
    </span>
  );
}

/**
 * A dashed tray that collects items (outputs, a call stack, extracted values). Shows
 * `empty` (as a faint mono note) when it has no children; pass your own element as a
 * child instead if the empty text needs the lesson's own styling.
 *
 * The label flows inline with short content by default; `stack` puts it on its own line
 * above the content (lists, result rows, a search field).
 */
export function Tray({
  label, labelWeight, empty, stack = false, className = '', ariaLabel, children, ...rest
}: {
  label?: ReactNode;
  labelWeight?: TitleWeight;
  empty?: ReactNode;
  stack?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
} & Forwarded<HTMLDivElement>) {
  const hasItems = Array.isArray(children) ? children.length > 0 : children != null && children !== false;
  return (
    <div {...rest} className={`tray ${stack ? 'is-stacked' : ''} ${className}`} aria-label={ariaLabel ?? rest['aria-label']}>
      {label && <SectionTitle weight={labelWeight}>{label}</SectionTitle>}
      {hasItems ? children : empty && <span className="empty-note">{empty}</span>}
    </div>
  );
}
