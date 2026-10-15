/** Step-by-step frames for the three player scenes. Pure: every sentence is built from the model's own values. */
import type { Frame } from '../../core/types';
import type { Block, Item } from './deflate';
import { showChar, tokenLength, type Token } from './lz77';

const quote = (s: string) => `"${Array.from(s).map(showChar).join('')}"`;
const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Scene 1: the greedy parse ───────────────────────────────────────

export interface ParseFrame extends Frame {
  /** Tokens emitted so far. */
  k: number;
  /** The token this frame just emitted (null before the first). */
  current: Token | null;
  /** The position the next decision is made at. */
  cursor: number;
}

export function parseFrames(text: string, tokens: readonly Token[], opts: { window: number; minMatch: number }): ParseFrame[] {
  const n = Array.from(text).length;
  const frames: ParseFrame[] = [
    {
      k: 0, current: null, cursor: 0,
      say: n === 0
        ? 'No characters yet: type something, or pick one of the examples.'
        : `${noun(n, 'character')} to parse. At each position the greedy parser takes the longest match inside the window (the last ${opts.window} characters, ties to the nearest copy) when it is at least ${opts.minMatch} long, and a literal otherwise.`,
    },
  ];
  tokens.forEach((t, i) => {
    const cursor = t.pos + tokenLength(t);
    let say: string;
    if (t.kind === 'literal') {
      say = t.best === 0
        ? `Position ${t.pos}: ${quote(t.char)} has no earlier copy inside the window, so it goes out as a literal.`
        : `Position ${t.pos}: the longest match here is ${noun(t.best, 'character')}, shorter than the minimum ${opts.minMatch}, so ${quote(t.char)} goes out as a literal.`;
    } else {
      const copied = text.slice(t.pos, t.pos + t.length);
      say = `Position ${t.pos}: ${quote(copied)} already appeared ${t.distance} back. One token (${t.distance}, ${t.length}) replaces ${noun(t.length, 'character')}${t.length > t.distance ? ', and the copy runs into its own output' : ''}.`;
    }
    frames.push({ k: i + 1, current: t, cursor, say });
  });
  if (tokens.length > 0) {
    const matches = tokens.filter((t) => t.kind === 'match').length;
    const last = frames[frames.length - 1];
    frames[frames.length - 1] = {
      ...last,
      say: `${last.say} Done: ${noun(n, 'character')} became ${noun(tokens.length, 'token')}, ${noun(matches, 'match', 'matches')} and ${noun(tokens.length - matches, 'literal')}.`,
    };
  }
  return frames;
}

// ── Scene 2: the decoder ────────────────────────────────────────────

export type DecodeMode = 'byte' | 'block';

export interface DecodeFrame extends Frame {
  /** The output so far. */
  out: string;
  /** Output index the copy read this frame, if it copied. */
  read: number | null;
  /** True when that character was written by the very copy that is reading it. */
  readOwn: boolean;
  /** The token being decoded (-1 on the intro frame). */
  token: number;
  /** Line of the decoder's pseudo-code that just ran (index into `decoderCode`). */
  line: number;
  /** The last frame, where the verdict is known. */
  done: boolean;
}

export const DECODER_CODE: Record<DecodeMode, string[]> = {
  byte: [
    'for token in tokens:',
    '  if literal:  out.append(char)',
    '  else:',
    '    start = len(out) - distance',
    '    for i in range(length):',
    '      out.append(out[start + i])   # may read what it just wrote',
  ],
  block: [
    'for token in tokens:',
    '  if literal:  out.append(char)',
    '  else:',
    '    start = len(out) - distance',
    '    out.extend(out[start : start + length])   # one block copy',
  ],
};
const LINE = { literal: 1, start: 3, copy: { byte: 5, block: 4 } } as const;

export function decodeFrames(tokens: readonly Token[], text: string, mode: DecodeMode): DecodeFrame[] {
  const n = Array.from(text).length;
  const frames: DecodeFrame[] = [
    {
      out: '', read: null, readOwn: false, token: -1, line: 0, done: false,
      say: n === 0
        ? 'No characters yet: type something, or pick one of the examples.'
        : mode === 'byte'
          ? `The decoder rebuilds the text from ${noun(tokens.length, 'token')}. A match copies one character at a time from the distance back, so it may read characters it has only just written.`
          : `The block decoder copies a whole match with one slice of what exists when the copy starts. Watch what it does when a match is longer than its distance.`,
    },
  ];
  let out: string[] = [];
  tokens.forEach((t, ti) => {
    if (t.kind === 'literal') {
      out = [...out, t.char];
      frames.push({ out: out.join(''), read: null, readOwn: false, token: ti, line: LINE.literal, done: false, say: `Literal ${quote(t.char)}: append it.` });
      return;
    }
    const start = out.length - t.distance;
    if (mode === 'block') {
      const piece = out.slice(start, start + t.length);
      out = [...out, ...piece];
      const short = piece.length < t.length;
      frames.push({
        out: out.join(''), read: piece.length > 0 ? start : null, readOwn: false, token: ti, line: LINE.copy.block, done: false,
        say: short
          ? `Match (${t.distance}, ${t.length}): the slice out[${start}:${start + t.length}] only reaches the end of the output, ${noun(piece.length, 'character')}, so ${noun(t.length - piece.length, 'character')} never get copied.`
          : `Match (${t.distance}, ${t.length}): copy ${noun(t.length, 'character')} starting ${t.distance} back in one go.`,
      });
      return;
    }
    for (let i = 0; i < t.length; i++) {
      const readAt = start + i;
      const own = readAt >= start + t.distance;
      const char = out[readAt];
      out = [...out, char];
      frames.push({
        out: out.join(''), read: readAt, readOwn: own, token: ti, line: LINE.copy.byte, done: false,
        say: `Match (${t.distance}, ${t.length}), character ${i + 1} of ${t.length}: read ${quote(char)} from ${t.distance} back${own ? ', a character this same copy wrote a moment ago' : ''}, and append it.`,
      });
    }
  });
  const final = frames[frames.length - 1];
  const got = final.out;
  const verdict = got === text
    ? `Decoded ${noun(n, 'character')}: identical to the original.`
    : `The decoder produced ${noun(Array.from(got).length, 'character')} where the original has ${n}: it is wrong.`;
  frames[frames.length - 1] = { ...final, done: true, say: tokens.length === 0 ? final.say : `${final.say} ${verdict}` };
  return frames;
}


// ── Scene 4: the DEFLATE block ──────────────────────────────────────

export interface DeflateFrame extends Frame {
  /** Index into block.items (0 is the header, the last is the end-of-block code). */
  item: number;
  /** Bits written once this item is in. */
  bitsSoFar: number;
}

const describeItem = (item: Item, tokenText: (t: NonNullable<Item['token']>) => string): string => {
  const [first] = item.parts;
  if (item.token === null) {
    return first.kind === 'header'
      ? `Header: ${first.bits.length} bits say "last block, fixed Huffman code".`
      : `End of block: the 7-bit code for symbol 256 (${first.bits}) tells the decoder to stop.`;
  }
  const t = item.token;
  if (t.kind === 'literal') return `Literal ${tokenText(t)}: its fixed code is ${first.bits} (${first.bits.length} bits).`;
  const parts = item.parts.map((p) => `${p.bits} (${p.detail})`).join(', ');
  return `Match (${t.distance}, ${t.length}): ${item.bits.length} bits, ${parts}.`;
};

export function deflateFrames(block: Block, text: string): DeflateFrame[] {
  const n = Array.from(text).length;
  let bits = 0;
  return block.items.map((item, i) => {
    bits += item.bits.length;
    const base = describeItem(item, (t) => (t.kind === 'literal' ? quote(t.char) : ''));
    const say = i === block.items.length - 1 ? `${base} The block is ${block.totalBits} bits, ${Math.ceil(block.totalBits / 8)} bytes, for ${noun(n, 'character')}.` : base;
    return { item: i, bitsSoFar: bits, say };
  });
}
