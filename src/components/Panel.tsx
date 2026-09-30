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

/** Small uppercase heading inside a panel, with an optional faint lower-case hint after it. */
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="section-title">
      {children}
      {hint && <span className="hint-inline">{hint}</span>}
    </span>
  );
}

/** A dashed tray that collects items (outputs, a call stack, extracted values). Shows `empty` when it has none. */
export function Tray({
  label, empty, className = '', children,
}: {
  label?: ReactNode;
  empty?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : children != null && children !== false;
  return (
    <div className={`tray ${className}`}>
      {label && <SectionTitle>{label}</SectionTitle>}
      {hasItems ? children : empty && <span className="empty-note">{empty}</span>}
    </div>
  );
}
