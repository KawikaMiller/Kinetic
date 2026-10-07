import { motion, useReducedMotion } from 'motion/react';
import { useMemo, type KeyboardEvent } from 'react';
import { SEQ, sequenceLayout, type SeqActor, type SeqMessage, type SeqRow } from '../core/sequenceLayout';
import type { Tone } from '../core/tone';
import { WideRegion } from './WideRegion';

export interface SequenceActor extends SeqActor {
  tone?: Tone;
  /** Draw the lifeline dashed: this actor is waiting (for a reply, a timeout, a lease). */
  waiting?: boolean;
}

export interface SequenceMessage extends SeqMessage {
  tone?: Tone;
}

const HEAD = 8;

/**
 * A ladder (sequence) diagram: actors across the top, a lifeline down from each, one
 * arrow per message in time order. `to: '*'` broadcasts (an arrowhead on every other
 * lifeline); `lost` stops the arrow partway with a ✕; `note` adds a muted line under it.
 * With `step`, only messages up to that index show and the current one is --hi, so a
 * lesson steps through a protocol with its player. Labels wrap to two lines before the
 * lanes widen; on a phone the diagram sits in a WideRegion at the narrowest width that
 * keeps its text at 8px or more. Layout is core/sequenceLayout (pure, tested).
 */
export function SequenceDiagram({
  actors, messages, step, onMessageClick, width, ariaLabel = 'Sequence diagram', className = '',
}: {
  actors: readonly SequenceActor[];
  messages: readonly SequenceMessage[];
  /** Index of the current message; later ones are hidden. Omit to show them all. */
  step?: number;
  onMessageClick?: (id: string) => void;
  /** Spread the lanes to this drawing width (never below the natural width). */
  width?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const layout = useMemo(() => sequenceLayout(actors, messages, width), [actors, messages, width]);
  const reduce = useReducedMotion();
  const shown = step === undefined ? messages.length : Math.min(messages.length, step + 1);
  const label = (m: SequenceMessage) => {
    const to = m.to === '*' ? 'everyone' : (actors.find((a) => a.id === m.to)?.label ?? m.to);
    const from = actors.find((a) => a.id === m.from)?.label ?? m.from;
    return `${from} to ${to}: ${m.label}${m.lost ? ' (lost)' : ''}${m.note ? `, ${m.note}` : ''}`;
  };

  return (
    <div className={`seq ${className}`}>
      <WideRegion minWidth={layout.minWidth} label={`${ariaLabel}: scroll sideways to see all of it`}>
        <svg className="seq-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} role="img" aria-label={ariaLabel}>
          {actors.map((a) => {
            const x = layout.lanes[a.id];
            return (
              <g key={a.id} className={`seq-actor ${a.tone ? `tone-${a.tone}` : ''} ${a.waiting ? 'is-waiting' : ''}`}>
                <line className="seq-lifeline" x1={x} x2={x} y1={layout.head.h} y2={layout.lifelineEnd} />
                <rect x={x - layout.head.w / 2} y={layout.head.y} width={layout.head.w} height={layout.head.h} rx={8} />
                <text x={x} y={layout.head.h / 2 + 4.5}>
                  {a.label}
                </text>
              </g>
            );
          })}
          {layout.rows.slice(0, shown).map((r, i) => {
            const m = messages[i];
            const current = step !== undefined && i === step;
            const tone = current ? 'hi' : m.tone;
            const clickable = !!onMessageClick;
            const onKey = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onMessageClick?.(m.id);
              }
            };
            return (
              <motion.g
                key={m.id}
                className={`seq-msg ${tone ? `tone-${tone}` : ''} ${current ? 'is-current' : ''} ${clickable ? 'is-clickable' : ''}`}
                initial={current && !reduce ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                {...(clickable
                  ? { role: 'button', tabIndex: 0, 'aria-label': label(m), onClick: () => onMessageClick(m.id), onKeyDown: onKey }
                  : {})}
              >
                {clickable && <rect className="seq-hit" x={0} y={r.labelY - SEQ.LINE_H} width={layout.width} height={rowBottom(r) - r.labelY + SEQ.LINE_H + 4} />}
                <Arrow r={r} />
                {r.lines.map((line, k) => (
                  <text key={k} className="seq-label" x={r.labelX} y={r.labelY + k * SEQ.LINE_H} textAnchor={r.kind === 'self' ? 'start' : 'middle'}>
                    {line}
                  </text>
                ))}
                {r.noteY !== null && (
                  <text className="seq-note" x={r.labelX} y={r.noteY} textAnchor={r.kind === 'self' ? 'start' : 'middle'}>
                    {m.note}
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>
      </WideRegion>
      <ol className="sr-only">
        {messages.slice(0, shown).map((m) => (
          <li key={m.id}>{label(m)}</li>
        ))}
      </ol>
    </div>
  );
}

const rowBottom = (r: SeqRow) => Math.max(r.y + (r.kind === 'self' ? SEQ.SELF_DROP : 0), r.noteY ?? 0);

function Arrow({ r }: { r: SeqRow }) {
  const head = (x: number, y: number, dir: 1 | -1, k: number) => (
    <polygon key={k} className="seq-head" points={`${x},${y} ${x - dir * HEAD},${y - HEAD / 2} ${x - dir * HEAD},${y + HEAD / 2}`} />
  );
  if (r.kind === 'self') {
    const y2 = r.y + SEQ.SELF_DROP;
    return (
      <>
        <path className="seq-line" d={`M${r.x1},${r.y} H${r.x2} V${y2} H${r.x1 + HEAD}`} />
        {head(r.x1, y2, -1, 0)}
      </>
    );
  }
  const xs = [r.x1, ...r.heads.map((h) => h.x)];
  const from = r.kind === 'broadcast' ? Math.min(...xs) : r.x1;
  const to = r.lostAt ?? (r.kind === 'broadcast' ? Math.max(...xs) : r.x2);
  // stop the line at the arrowhead's base so the tip stays sharp
  const dir = to >= from ? 1 : -1;
  const end = r.lostAt === null && r.kind !== 'broadcast' ? to - dir * HEAD : to;
  return (
    <>
      <line className={`seq-line ${r.kind === 'broadcast' ? 'is-broadcast' : ''}`} x1={from} x2={end} y1={r.y} y2={r.y} />
      {r.heads.map((h, k) => head(h.x, r.y, h.dir, k))}
      {r.lostAt !== null && (
        <g className="seq-lost">
          <line x1={r.lostAt - 5} x2={r.lostAt + 5} y1={r.y - 5} y2={r.y + 5} />
          <line x1={r.lostAt - 5} x2={r.lostAt + 5} y1={r.y + 5} y2={r.y - 5} />
        </g>
      )}
    </>
  );
}
