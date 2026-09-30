import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

const VARIANTS = {
  /** Scale up briefly whenever the value changes. */
  pop: { initial: { scale: 1.25 }, animate: { scale: 1 }, exit: undefined },
  /** Old value slides up and out, new one slides in from below. */
  flip: { initial: { y: 10, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -10, opacity: 0 } },
} as const;

/**
 * A value that animates when it changes: counters, balances, formula results.
 * Re-keys on `id` (default: the value itself when it's a string or number).
 */
export function AnimatedValue({
  value, id, variant = 'pop', as = 'span', className,
}: {
  value: ReactNode;
  id?: string | number;
  variant?: keyof typeof VARIANTS;
  as?: 'span' | 'b' | 'code';
  className?: string;
}) {
  const key = id ?? (typeof value === 'string' || typeof value === 'number' ? value : undefined);
  const v = VARIANTS[variant];
  const Tag = motion[as];
  const node = (
    <Tag key={key} className={className} initial={v.initial} animate={v.animate} exit={v.exit} style={{ display: 'inline-block' }}>
      {value}
    </Tag>
  );
  return variant === 'flip' ? (
    <AnimatePresence mode="popLayout" initial={false}>
      {node}
    </AnimatePresence>
  ) : (
    node
  );
}
