/**
 * Layout for SequenceDiagram (ladder diagrams: DHCP's DORA, a DNS walk, a webhook retry).
 * Pure: actor lanes, one row per message, wrapped labels and the arrow geometry, all in
 * drawing units, plus the narrowest container width at which its text stays readable.
 */
import { minWidthForText } from './scale';

export interface SeqActor {
  id: string;
  label: string;
}

export interface SeqMessage {
  id: string;
  from: string;
  /**
   * An actor id, '*' for a broadcast to every other actor, or a list of actor ids for a
   * message that reaches only some lifelines (an arrowhead on each).
   */
  to: string | readonly string[];
  /**
   * Draw it as a broadcast (dotted line) although `to` names its receivers: a broadcast only
   * some lifelines hear, like a DHCPDISCOVER that only the relay on the link picks up.
   * `to: '*'` is always a broadcast.
   */
  broadcast?: boolean;
  label: string;
  /** Lost on the way: the arrow stops partway with a ✕. */
  lost?: boolean;
  /** A muted line under the arrow ("retries in 2 s", "cached for 300 s"); wraps to two lines like the label. */
  note?: string;
}

/** `broadcast` is drawn dotted; `fanout` is a plain message with an arrowhead on several lifelines. */
export type SeqKind = 'right' | 'left' | 'self' | 'broadcast' | 'fanout';

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
  /** Arrowhead tips: the receiving end, or every receiving lifeline of a broadcast or fan-out. */
  heads: { x: number; dir: 1 | -1 }[];
  /** Label lines (one or two), centred at labelX, the last one just above the arrow. */
  lines: string[];
  labelX: number;
  /** y of the first label line's baseline. */
  labelY: number;
  /** First note line's baseline, under the arrow; null without a note. */
  noteY: number | null;
  /** Note lines (one or two, NOTE_H apart); empty without a note. */
  noteLines: string[];
  /** The lowest y the row draws at: its arrow, self-loop or last note line. */
  bottom: number;
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
  /** Container width below which the smallest text drawn (the notes at NOTE_FONT when any message has one, else the labels at FONT) would render under MIN_TEXT_PX (core/scale). */
  minWidth: number;
}

export const SEQ = {
  FONT: 12,
  /** The note font size in kit.css (`.seq-note`), smaller than FONT: with notes it sets the narrowest readable width. */
  NOTE_FONT: 11,
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
  /** Space under the lifelines' end. */
  FOOT: 4,
} as const;

/** SequenceDiagram keeps notes on one line while that drawing still renders at this share of its size or more. */
export const ROOMY_MIN_SCALE = 0.85;

/**
 * Pick between the roomy layout (notes on one line) and the compact one (notes wrapped) for a
 * container `room` px wide: roomy while it renders at ROOMY_MIN_SCALE or more, else compact.
 * Unmeasured (null) keeps roomy.
 */
export function pickLayout(roomy: SeqLayout, compact: SeqLayout, room: number | null): SeqLayout {
  return room === null || room >= roomy.width * ROOMY_MIN_SCALE ? roomy : compact;
}

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

/** The actor ids a message reaches ('*' is every actor but the sender). */
export function receivers(actors: readonly SeqActor[], m: SeqMessage): string[] {
  if (m.to === '*') return actors.filter((a) => a.id !== m.from).map((a) => a.id);
  return typeof m.to === 'string' ? [m.to] : [...m.to];
}

/** A note's lines: wrapped like a label into `maxW`, or kept on one line when notes don't wrap. */
const noteLinesOf = (note: string | undefined, maxW: number, wrapNotes: boolean) => (!note ? [] : wrapNotes ? wrapLabel(note, maxW) : [note]);

/** The width a lane gap needs so every message between neighbours fits: labels in two lines, notes in two or one. */
function neededGap(actors: readonly SeqActor[], messages: readonly SeqMessage[], wrapNotes: boolean): number {
  const idx = new Map(actors.map((a, i) => [a.id, i]));
  let gap: number = SEQ.MIN_GAP;
  for (const m of messages) {
    const from = idx.get(m.from) ?? 0;
    const span = Math.max(1, ...receivers(actors, m).map((id) => Math.abs((idx.get(id) ?? 0) - from)));
    // wrapping into zero width gives the balanced two-line split: labels and notes wrap before lanes widen
    const twoLine = Math.max(...wrapLabel(m.label, 0).map(textWidth), ...noteLinesOf(m.note, 0, wrapNotes).map(textWidth));
    gap = Math.max(gap, (twoLine + SEQ.PAD * 2) / span);
  }
  for (const a of actors) gap = Math.max(gap, textWidth(a.label) + SEQ.PAD);
  return Math.ceil(gap);
}

const isSelf = (m: SeqMessage) => typeof m.to === 'string' && m.to === m.from;

/**
 * How far self-messages on the last lifeline reach past the usual side margin: their label
 * starts right of the loop, and nothing beyond that lane would otherwise make room for it.
 * `maxW` is the width their label and note wrap into.
 */
function selfOverhang(actors: readonly SeqActor[], messages: readonly SeqMessage[], maxW: number, side: number, wrapNotes: boolean): number {
  if (actors.length < 2) return 0;
  const last = actors[actors.length - 1].id;
  const reach = messages
    .filter((m) => m.from === last && isSelf(m))
    .map((m) => SEQ.SELF_W + 4 + Math.max(...wrapLabel(m.label, maxW).map(textWidth), ...noteLinesOf(m.note, maxW, wrapNotes).map(textWidth)) + SEQ.PAD);
  return Math.ceil(Math.max(0, ...reach.map((r) => r - side)));
}

/**
 * Lay out the diagram. With `width`, lanes spread to fill it (never closer than the labels
 * need); without, the diagram takes its natural width. Labels always wrap to two lines before
 * the lanes widen; notes do too unless `wrapNotes` is false, which keeps each note on one line
 * and lets it widen the lanes instead (roomier, for when there's space: SequenceDiagram picks).
 */
export function sequenceLayout(actors: readonly SeqActor[], messages: readonly SeqMessage[], width?: number, { wrapNotes = true }: { wrapNotes?: boolean } = {}): SeqLayout {
  if (!actors.length) throw new RangeError('a sequence diagram needs at least one actor');
  const idx = new Map(actors.map((a, i) => [a.id, i]));
  for (const m of messages) {
    if (!idx.has(m.from)) throw new RangeError(`message ${m.id}: unknown sender ${m.from}`);
    const to = receivers(actors, m);
    if (m.to !== '*' && !to.length) throw new RangeError(`message ${m.id}: no receivers`);
    for (const id of to) if (!idx.has(id)) throw new RangeError(`message ${m.id}: unknown receiver ${id}`);
  }
  const side = SEQ.HEAD_W / 2 + SEQ.PAD;
  const gap = neededGap(actors, messages, wrapNotes);
  // Self-messages on the last lane take their balanced two-line wrap, so the margin kept for them stays small.
  const lastSelfW = 0;
  const overhang = selfOverhang(actors, messages, lastSelfW, side, wrapNotes);
  const natural = side * 2 + gap * Math.max(0, actors.length - 1) + (actors.length === 1 ? SEQ.SELF_W * 2 : 0) + overhang;
  const W = Math.max(natural, width ?? 0);
  const step = actors.length > 1 ? (W - overhang - side * 2) / (actors.length - 1) : 0;
  const lastId = actors[actors.length - 1].id;
  const lanes: Record<string, number> = {};
  actors.forEach((a, i) => (lanes[a.id] = actors.length > 1 ? side + i * step : W / 2));

  const head = { y: 0, w: SEQ.HEAD_W, h: SEQ.HEAD_H };
  let y = head.h + SEQ.ROW_GAP;
  const rows: SeqRow[] = messages.map((m) => {
    const x1 = lanes[m.from];
    const to = receivers(actors, m);
    const broadcast = m.to === '*' || !!m.broadcast;
    let kind: SeqKind;
    let x2: number;
    let heads: SeqRow['heads'];
    let maxW: number;
    let labelX: number;
    if (broadcast || to.length > 1) {
      kind = broadcast ? 'broadcast' : 'fanout';
      const xs = to.map((id) => lanes[id]);
      const lo = Math.min(x1, ...xs);
      const hi = Math.max(x1, ...xs);
      x2 = hi > x1 ? hi : lo;
      heads = xs.map((x) => ({ x, dir: x > x1 ? 1 : -1 }));
      maxW = Math.max(hi - lo, step) - SEQ.PAD * 2;
      labelX = (lo + hi) / 2;
    } else if (to[0] === m.from) {
      kind = 'self';
      x2 = x1 + SEQ.SELF_W;
      heads = [{ x: x1, dir: -1 }];
      maxW = actors.length > 1 && m.from === lastId ? lastSelfW : Math.max(step, SEQ.MIN_GAP) - SEQ.PAD * 2;
      labelX = x1 + SEQ.SELF_W + 4;
    } else {
      x2 = lanes[to[0]];
      kind = x2 > x1 ? 'right' : 'left';
      heads = [{ x: x2, dir: x2 > x1 ? 1 : -1 }];
      maxW = Math.abs(x2 - x1) - SEQ.PAD * 2;
      labelX = (x1 + x2) / 2;
    }
    const lostAt = m.lost && kind !== 'self' ? x1 + (x2 - x1) * SEQ.LOST_AT : null;
    if (lostAt !== null) heads = [];
    const lines = wrapLabel(m.label, maxW);
    const noteLines = noteLinesOf(m.note, maxW, wrapNotes);
    const top = y;
    const lineY = top + lines.length * SEQ.LINE_H + 8;
    const arrowBottom = lineY + (kind === 'self' ? SEQ.SELF_DROP : 0);
    const bottom = arrowBottom + noteLines.length * SEQ.NOTE_H;
    y = bottom + SEQ.ROW_GAP;
    return {
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
      noteY: noteLines.length ? arrowBottom + SEQ.NOTE_H : null,
      noteLines,
      bottom,
    };
  });
  const lifelineEnd = y;
  return {
    width: W,
    height: lifelineEnd + SEQ.FOOT,
    lanes,
    head,
    lifelineEnd,
    rows,
    minWidth: minWidthForText(W, messages.some((m) => m.note) ? SEQ.NOTE_FONT : SEQ.FONT),
  };
}

/**
 * Where the lifelines end and how tall the drawing is when only the first `shown` rows are
 * drawn (SequenceDiagram `fit: 'shown'`): the height follows the step instead of reserving
 * room for the messages still to come.
 */
export function shownExtent(layout: SeqLayout, shown: number): { lifelineEnd: number; height: number } {
  if (shown >= layout.rows.length) return { lifelineEnd: layout.lifelineEnd, height: layout.height };
  const lifelineEnd = (shown > 0 ? layout.rows[shown - 1].bottom : layout.head.h) + SEQ.ROW_GAP;
  return { lifelineEnd, height: lifelineEnd + SEQ.FOOT };
}
