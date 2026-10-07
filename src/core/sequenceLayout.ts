/**
 * Layout for SequenceDiagram (ladder diagrams: DHCP's DORA, a DNS walk, a webhook retry).
 * Pure: actor lanes, one row per message, wrapped labels and the arrow geometry, all in
 * drawing units, plus the narrowest container width at which its text stays readable.
 */

export interface SeqActor {
  id: string;
  label: string;
}

export interface SeqMessage {
  id: string;
  from: string;
  /** An actor id, or '*' for a broadcast to every other actor. */
  to: string;
  label: string;
  /** Lost on the way: the arrow stops partway with a ✕. */
  lost?: boolean;
  /** A muted line under the arrow ("retries in 2 s", "cached for 300 s"). */
  note?: string;
}

export type SeqKind = 'right' | 'left' | 'self' | 'broadcast';

export interface SeqRow {
  id: string;
  kind: SeqKind;
  /** y of the arrow line. */
  y: number;
  /** Arrow from x1 to x2 (for self: the loop's start x; the loop returns at y + SELF_DROP). */
  x1: number;
  x2: number;
  /** Where a lost message stops (and its ✕ sits); null when it arrives. */
  lostAt: number | null;
  /** Arrowhead tips: the receiving end, or every other lifeline for a broadcast. */
  heads: { x: number; dir: 1 | -1 }[];
  /** Label lines (one or two), centred at labelX, the last one just above the arrow. */
  lines: string[];
  labelX: number;
  /** y of the first label line's baseline. */
  labelY: number;
  /** Note baseline, under the arrow; null without a note. */
  noteY: number | null;
}

export interface SeqLayout {
  width: number;
  height: number;
  /** Lifeline x per actor id. */
  lanes: Record<string, number>;
  /** Top of the actor boxes and their size. */
  head: { y: number; w: number; h: number };
  /** Lifelines run from head bottom to here. */
  lifelineEnd: number;
  rows: SeqRow[];
  /** Container width below which the label text would render under MIN_TEXT_PX. */
  minWidth: number;
}

export const SEQ = {
  FONT: 12,
  /** Approximate advance of one character of the 12px UI font. */
  CHAR_W: 6.6,
  LINE_H: 15,
  PAD: 12,
  HEAD_W: 108,
  HEAD_H: 40,
  ROW_GAP: 16,
  NOTE_H: 15,
  /** Width of the self-message loop and how far it drops. */
  SELF_W: 34,
  SELF_DROP: 14,
  /** Lost messages stop this far along their path. */
  LOST_AT: 0.6,
  MIN_GAP: 120,
  MIN_TEXT_PX: 8,
} as const;

export const textWidth = (s: string) => s.length * SEQ.CHAR_W;

/**
 * Fit `label` into `maxW`: one line if it fits, otherwise two lines split at the space
 * that best balances them (a single unbreakable word stays one line, and overflows).
 */
export function wrapLabel(label: string, maxW: number): string[] {
  if (textWidth(label) <= maxW) return [label];
  const words = label.split(' ');
  if (words.length < 2) return [label];
  let best: string[] = [label];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(textWidth(a), textWidth(b));
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}

/** The width a lane gap needs so every message between neighbours fits in two lines. */
function neededGap(actors: readonly SeqActor[], messages: readonly SeqMessage[]): number {
  const idx = new Map(actors.map((a, i) => [a.id, i]));
  let gap: number = SEQ.MIN_GAP;
  for (const m of messages) {
    const from = idx.get(m.from) ?? 0;
    const to = m.to === '*' ? null : (idx.get(m.to) ?? 0);
    const span = to === null ? Math.max(1, actors.length - 1) : Math.max(1, Math.abs(to - from));
    // wrapping into zero width gives the balanced two-line split: labels wrap before lanes widen
    const twoLine = Math.max(...wrapLabel(m.label, 0).map(textWidth), textWidth(m.note ?? ''));
    gap = Math.max(gap, (twoLine + SEQ.PAD * 2) / span);
  }
  for (const a of actors) gap = Math.max(gap, textWidth(a.label) + SEQ.PAD);
  return Math.ceil(gap);
}

/**
 * Lay out the diagram. With `width`, lanes spread to fill it (never closer than the labels
 * need); without, the diagram takes its natural width.
 */
export function sequenceLayout(actors: readonly SeqActor[], messages: readonly SeqMessage[], width?: number): SeqLayout {
  if (!actors.length) throw new RangeError('a sequence diagram needs at least one actor');
  const idx = new Map(actors.map((a, i) => [a.id, i]));
  for (const m of messages) {
    if (!idx.has(m.from)) throw new RangeError(`message ${m.id}: unknown sender ${m.from}`);
    if (m.to !== '*' && !idx.has(m.to)) throw new RangeError(`message ${m.id}: unknown receiver ${m.to}`);
  }
  const side = SEQ.HEAD_W / 2 + SEQ.PAD;
  const gap = neededGap(actors, messages);
  const natural = side * 2 + gap * Math.max(0, actors.length - 1) + (actors.length === 1 ? SEQ.SELF_W * 2 : 0);
  const W = Math.max(natural, width ?? 0);
  const step = actors.length > 1 ? (W - side * 2) / (actors.length - 1) : 0;
  const lanes: Record<string, number> = {};
  actors.forEach((a, i) => (lanes[a.id] = actors.length > 1 ? side + i * step : W / 2));

  const head = { y: 0, w: SEQ.HEAD_W, h: SEQ.HEAD_H };
  let y = head.h + SEQ.ROW_GAP;
  const rows: SeqRow[] = messages.map((m) => {
    const x1 = lanes[m.from];
    let kind: SeqKind;
    let x2: number;
    let heads: SeqRow['heads'];
    let maxW: number;
    let labelX: number;
    if (m.to === '*') {
      kind = 'broadcast';
      const xs = actors.filter((a) => a.id !== m.from).map((a) => lanes[a.id]);
      const lo = Math.min(x1, ...xs);
      const hi = Math.max(x1, ...xs);
      x2 = hi > x1 ? hi : lo;
      heads = xs.map((x) => ({ x, dir: x > x1 ? 1 : -1 }));
      maxW = Math.max(hi - lo, step) - SEQ.PAD * 2;
      labelX = (lo + hi) / 2;
    } else if (m.to === m.from) {
      kind = 'self';
      x2 = x1 + SEQ.SELF_W;
      heads = [{ x: x1, dir: -1 }];
      maxW = Math.max(step, SEQ.MIN_GAP) - SEQ.PAD * 2;
      labelX = x1 + SEQ.SELF_W + 4;
    } else {
      x2 = lanes[m.to];
      kind = x2 > x1 ? 'right' : 'left';
      heads = [{ x: x2, dir: x2 > x1 ? 1 : -1 }];
      maxW = Math.abs(x2 - x1) - SEQ.PAD * 2;
      labelX = (x1 + x2) / 2;
    }
    const lostAt = m.lost && kind !== 'self' ? x1 + (x2 - x1) * SEQ.LOST_AT : null;
    if (lostAt !== null) heads = [];
    const lines = wrapLabel(m.label, maxW);
    const top = y;
    const lineY = top + lines.length * SEQ.LINE_H + 8;
    const row: SeqRow = {
      id: m.id,
      kind,
      y: lineY,
      x1,
      x2,
      lostAt,
      heads,
      lines,
      labelX,
      labelY: top + SEQ.LINE_H - 3,
      noteY: m.note ? lineY + (kind === 'self' ? SEQ.SELF_DROP : 0) + SEQ.NOTE_H : null,
    };
    y = lineY + (kind === 'self' ? SEQ.SELF_DROP : 0) + (m.note ? SEQ.NOTE_H : 0) + SEQ.ROW_GAP;
    return row;
  });
  const lifelineEnd = y;
  return {
    width: W,
    height: lifelineEnd + 4,
    lanes,
    head,
    lifelineEnd,
    rows,
    minWidth: Math.ceil((W * SEQ.MIN_TEXT_PX) / SEQ.FONT),
  };
}
