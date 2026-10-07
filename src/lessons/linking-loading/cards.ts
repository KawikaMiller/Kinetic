import type { Input } from './link';
import { inputName } from './presets';

/**
 * Where each input's card and each symbol row sit in the link picture. One card per input on
 * the command line, stacked; a defined symbol is a peg and a needed one a socket, both on the
 * card's right edge, so resolution arrows can bow out through the gutter on the right.
 */

export const CARD = { x: 12, w: 236, titleH: 26, memberH: 20, rowH: 21, gap: 14, top: 10, gutter: 230 } as const;

export interface SymRow {
  /** The object file the symbol belongs to (an archive member's own name). */
  obj: string;
  symbol: string;
  kind: 'peg' | 'socket';
  y: number;
}

export interface Card {
  input: number;
  name: string;
  kind: Input['kind'];
  y: number;
  h: number;
  /** Archive members, each with the y of its sub-title. */
  members: { name: string; y: number }[];
  rows: SymRow[];
  note?: string;
}

/** Symbols a shared library card lists: just what this program could use from it. */
const SHOWN_EXPORTS = ['printf'];

export function cardLayout(inputs: readonly Input[]): { cards: Card[]; width: number; height: number } {
  const cards: Card[] = [];
  let y = CARD.top;
  inputs.forEach((inp, i) => {
    const top = y;
    let cy = top + CARD.titleH;
    const rows: SymRow[] = [];
    const members: Card['members'] = [];
    const addObj = (obj: { name: string; defines: readonly { name: string }[]; relocs: readonly { symbol: string }[]; locals?: readonly { name: string }[] }) => {
      for (const s of obj.defines) {
        rows.push({ obj: obj.name, symbol: s.name, kind: 'peg', y: cy + CARD.rowH / 2 });
        cy += CARD.rowH;
      }
      const locals = new Set((obj.locals ?? []).map((s) => s.name));
      const needs = [...new Set(obj.relocs.map((r) => r.symbol))].filter((s) => !locals.has(s) && !obj.defines.some((d) => d.name === s));
      for (const s of needs) {
        rows.push({ obj: obj.name, symbol: s, kind: 'socket', y: cy + CARD.rowH / 2 });
        cy += CARD.rowH;
      }
    };
    let note: string | undefined;
    if (inp.kind === 'obj') addObj(inp.obj);
    else if (inp.kind === 'archive') {
      for (const m of inp.members) {
        members.push({ name: m.name, y: cy + CARD.memberH / 2 + 4 });
        cy += CARD.memberH;
        addObj(m);
      }
    } else {
      for (const s of SHOWN_EXPORTS.filter((x) => inp.exports.includes(x))) {
        rows.push({ obj: inp.name, symbol: s, kind: 'peg', y: cy + CARD.rowH / 2 });
        cy += CARD.rowH;
      }
      note = '… and thousands more';
      cy += CARD.rowH;
    }
    const h = cy - top + 6;
    cards.push({ input: i, name: inputName(inp), kind: inp.kind, y: top, h, members, rows, note });
    y = top + h + CARD.gap;
  });
  return { cards, width: CARD.x + CARD.w + CARD.gutter, height: y };
}

/** The sideways bow of an arrow from one row to another on the same edge: further apart, wider. */
export function arrowBend(fromY: number, toY: number): number {
  const dy = toY - fromY;
  const size = 22 + Math.abs(dy) * 0.45;
  // RefArrow bows to the left of travel: going down, left is -x (into the card), so flip it.
  return dy > 0 ? -size : size;
}
