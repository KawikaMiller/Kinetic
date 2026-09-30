import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { SHAKE, SPRING } from '../core/motion';
import type { Tone } from '../core/tone';

/**
 * What a frame is doing right now:
 * - `idle`: plain (the default), e.g. a paused debugger's lower frames
 * - `running`: the top frame executing (solid --hi)
 * - `waiting`: paused until a callee returns (dimmed)
 * - `returning`: receiving a value from the frame that just popped (--info)
 * - `ok`: finished well / handled it (a base case, a `catch`) (--ok)
 * - `error`: throwing, crashed, or unwinding past (--bad)
 */
export type CallFrameState = 'idle' | 'running' | 'waiting' | 'returning' | 'ok' | 'error';

export interface CallFrame {
  /** Stable per call, so pushes and pops animate the right row. */
  id: string | number;
  name: ReactNode;
  /** Right-aligned note: arguments, "waiting on …", a returned value. */
  detail?: ReactNode;
  state?: CallFrameState;
  /**
   * Accent for an idle or waiting frame, to match the lesson's own colour for it (e.g. violet
   * "on the stack" nodes in a tree). Running/returning/ok/error keep their state colours.
   */
  tone?: Tone;
}

const POP_EXIT = { opacity: 0, x: 80, transition: { duration: 0.3 } };

/**
 * A call stack: frames push in from above and pop off to the right.
 *
 * - `frames` is **top first** (the running call at index 0), like a debugger lists them.
 * - `anchor="bottom"` (default) stacks from the bottom up, like a stack of plates;
 *   `anchor="top"` lists from the top, like the DevTools call-stack pane.
 * - `showDepth` numbers each frame by its depth (0 = the outermost call).
 * - `selected` / `onSelect` make frames clickable (a debugger picking a frame to inspect).
 * - `alarm` turns the whole stack red and shakes it (stack overflow, uncaught throw).
 * - `empty` is shown when there are no frames; `overlay` draws over the stack (a crash banner).
 */
export function CallStackPanel({
  frames, title = 'Call stack', meta, anchor = 'bottom', showDepth = true, selected, onSelect, alarm = false,
  empty, overlay, minHeight = 360, className = '',
}: {
  frames: readonly CallFrame[];
  title?: ReactNode;
  meta?: ReactNode;
  anchor?: 'bottom' | 'top';
  showDepth?: boolean;
  selected?: CallFrame['id'];
  onSelect?: (id: CallFrame['id']) => void;
  alarm?: boolean;
  empty?: ReactNode;
  overlay?: ReactNode;
  minHeight?: number;
  className?: string;
}) {
  // Bottom-anchored stacks render outermost-first in a column-reverse box.
  const rows = anchor === 'bottom' ? [...frames].reverse() : frames;
  const depthOf = (row: number) => (anchor === 'bottom' ? row : frames.length - 1 - row);

  return (
    <div className={`call-stack ${alarm ? 'is-alarm' : ''} ${className}`}>
      <div className="call-stack-head">
        <span>{title}</span>
        {meta && <span className="call-stack-meta">{meta}</span>}
      </div>
      <div className={`call-stack-box is-${anchor}`} style={{ minHeight }}>
        <AnimatePresence initial={false}>
          {rows.map((f, row) => {
            const clickable = !!onSelect;
            const Row = clickable ? motion.button : motion.div;
            return (
              <Row
                key={f.id}
                layout
                type={clickable ? 'button' : undefined}
                className={`call-frame is-${f.state ?? 'idle'} ${f.tone ? `has-tone tone-${f.tone}` : ''} ${f.id === selected ? 'is-selected' : ''} ${clickable ? 'is-clickable' : ''}`}
                initial={{ opacity: 0, y: -24, scale: 0.9 }}
                animate={alarm ? { opacity: 1, y: 0, scale: 1, ...SHAKE } : { opacity: 1, y: 0, scale: 1 }}
                exit={POP_EXIT}
                transition={SPRING.snappy}
                onClick={clickable ? () => onSelect(f.id) : undefined}
              >
                {showDepth && <span className="call-frame-depth">{depthOf(row)}</span>}
                <b>{f.name}</b>
                {f.detail != null && <span className="call-frame-detail">{f.detail}</span>}
              </Row>
            );
          })}
        </AnimatePresence>
        {frames.length === 0 && empty}
      </div>
      {overlay}
    </div>
  );
}
