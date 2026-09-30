import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  commitEdgePath, DEFAULT_SPACING, defaultLaneColor, layoutCommitGraph, shortMessage, type CommitGraphSpacing, type GraphCommitShape,
} from '../core/commitGraph';
import { toneVar, type Tone } from '../core/tone';

export interface GraphCommit extends GraphCommitShape {
  /** Text inside the circle, e.g. the first 4 characters of the hash. */
  short: string;
  /** Text under the circle, e.g. the commit message (cut to 12 characters). */
  message?: string;
  /** Unreachable from any branch: faded and dashed. */
  dead?: boolean;
  /** Override the lane colour for this commit's ring, e.g. `bad` for the commit that leaked a key. */
  tone?: Tone;
}

export interface GraphRef {
  name: string;
  /** Commit id the ref points at. */
  at: string;
  /** The checked-out branch: drawn as "HEAD → name" in --hi. */
  head?: boolean;
}

const COMMIT_SPRING = { type: 'spring', stiffness: 320, damping: 22 } as const;
const TAG_SPRING = { type: 'spring', stiffness: 260, damping: 24 } as const;
const RADIUS = 14;
const SELECTED_RADIUS = 17;
const TAG_CHAR_W = 6.6;
const TAG_PAD = 14;
const TAG_H = 18;
/** How far above its commit the first tag sits, and the step between stacked tags. */
const TAG_RISE = 42;
const TAG_STACK = 22;
/** Scroller padding (must match .commit-graph padding in kit.css). */
const SCROLL_PAD = 12;

/**
 * A git commit graph: commits left to right in the order given, one row per lane,
 * parent → child edges (S-curves across lanes), merge commits with a thicker ring,
 * unreachable commits faded, and branch tags (HEAD highlighted) stacked above their commit.
 *
 * It sits in its own horizontally scrolling panel. When commits are added it scrolls the
 * newest one into view, and fades the edge that has more graph hidden behind it, so on a
 * phone you can see there's more to swipe to.
 */
export function CommitGraph({
  commits, refs = [], selected, onSelect, laneColor = defaultLaneColor, title, follow = true,
  spacing = DEFAULT_SPACING, overlay, className = '',
}: {
  /** Oldest first: left to right. */
  commits: readonly GraphCommit[];
  refs?: readonly GraphRef[];
  selected?: string;
  onSelect?: (id: string) => void;
  laneColor?: (lane: number) => string;
  title?: ReactNode;
  /** Scroll the newest commit into view whenever the commit count changes (default true). */
  follow?: boolean;
  spacing?: CommitGraphSpacing;
  /** Extra drawing over the graph (conflict markers, a leaked-key badge). */
  overlay?: (at: (id: string) => { x: number; y: number } | undefined) => ReactNode;
  className?: string;
}) {
  const { at, width, height } = layoutCommitGraph(commits, spacing);
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Where the newest commit's right edge is, read by the follow effect below. Kept in a ref so
  // the effect runs only when a commit is added or removed, not on every render.
  const newest = commits[commits.length - 1];
  const newestP = newest && at(newest.id);
  const followTo = useRef<number | null>(null);
  useEffect(() => {
    followTo.current = follow && newestP ? SCROLL_PAD * 2 + newestP.x + spacing.padX : null;
  });
  useEffect(() => {
    // Next frame: the new width may not be laid out yet (e.g. the reduced-motion rule gives
    // every property a 0.01ms transition), and a scroll past the current end gets clamped.
    const id = requestAnimationFrame(() => {
      const el = scroller.current;
      const right = followTo.current;
      // Bring the newest commit to the right edge, but never scroll past the start.
      if (el && right !== null) el.scrollTo({ left: Math.max(0, right - el.clientWidth), behavior: 'smooth' });
      measure();
    });
    return () => cancelAnimationFrame(id);
  }, [commits.length, measure]);

  const tagsAt = new Map<string, string[]>();
  for (const r of refs) tagsAt.set(r.at, [...(tagsAt.get(r.at) ?? []), r.name]);
  const ring = (c: GraphCommit) => (c.tone ? toneVar(c.tone) : laneColor(c.lane));

  return (
    <div
      ref={scroller}
      className={`commit-graph ${more.left ? 'has-more-left' : ''} ${more.right ? 'has-more-right' : ''} ${className}`}
      onScroll={measure}
    >
      {title && <span className="commit-graph-title">{title}</span>}
      <svg width={width} height={height} className="commit-graph-svg">
        {commits.flatMap((c) =>
          c.parents.map((pid) => {
            const a = at(pid);
            const b = at(c.id);
            if (!a || !b) return null;
            return (
              <motion.path
                key={`${pid}-${c.id}`}
                d={commitEdgePath(a, b, spacing.col)}
                className={`commit-edge ${c.dead ? 'is-dead' : ''}`}
                stroke={laneColor(c.lane)}
                initial={{ opacity: 0 }}
                animate={{ opacity: c.dead ? 0.25 : 0.8 }}
              />
            );
          }),
        )}

        {commits.map((c) => {
          const { x, y } = at(c.id)!;
          const isSel = c.id === selected;
          return (
            <motion.g
              key={c.id}
              className={`commit-node ${c.dead ? 'is-dead' : ''} ${isSel ? 'is-selected' : ''} ${onSelect ? 'is-clickable' : ''}`}
              initial={{ x, y, scale: 0, opacity: 0 }}
              animate={{ x, y, scale: 1, opacity: c.dead ? 0.35 : 1 }}
              transition={COMMIT_SPRING}
              onClick={onSelect && (() => onSelect(c.id))}
            >
              <circle
                r={isSel ? SELECTED_RADIUS : RADIUS}
                fill="var(--panel)"
                stroke={ring(c)}
                strokeWidth={c.parents.length > 1 ? 4 : 2.5}
                strokeDasharray={c.dead ? '4 3' : undefined}
              />
              <text y={4} textAnchor="middle" className="commit-hash">
                {c.short}
              </text>
              {c.message && (
                <text y={32} textAnchor="middle" className="commit-msg">
                  {shortMessage(c.message)}
                </text>
              )}
            </motion.g>
          );
        })}

        {refs.map((r) => {
          const p = at(r.at);
          if (!p) return null;
          const k = tagsAt.get(r.at)!.indexOf(r.name);
          const text = r.head ? `HEAD → ${r.name}` : r.name;
          const w = text.length * TAG_CHAR_W + TAG_PAD;
          return (
            <motion.g key={r.name} initial={false} animate={{ x: p.x - w / 2, y: p.y - TAG_RISE - k * TAG_STACK }} transition={TAG_SPRING}>
              <rect width={w} height={TAG_H} rx={5} className={`commit-tag ${r.head ? 'is-head' : ''}`} />
              <text x={w / 2} y={12.5} textAnchor="middle" className={`commit-tag-text ${r.head ? 'is-head' : ''}`}>
                {text}
              </text>
            </motion.g>
          );
        })}

        {overlay?.(at)}
      </svg>
    </div>
  );
}
