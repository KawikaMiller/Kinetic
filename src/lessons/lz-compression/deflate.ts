/**
 * A fixed-Huffman DEFLATE block (RFC 1951, section 3.2.6), pure: LZ77 tokens become the literal/length and
 * distance symbols of the fixed code, with their extra bits, packed least-significant-bit first into
 * bytes. The output is a valid raw DEFLATE stream; the tests decode it with Node's zlib, which is what
 * pins the bit order, both code tables and the end-of-block code.
 */
import { DEFLATE_MIN_MATCH, MAX_MATCH, type Token } from './lz77';

export const END_OF_BLOCK = 256;
/** BFINAL = 1 (last block) then BTYPE = 01 (fixed Huffman), with BTYPE's low bit first: the bits 1, 1, 0. */
export const HEADER_BITS = '110';

/** Length codes 257..285: the smallest length each covers and how many extra bits refine it. */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258] as const;
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0] as const;
const FIRST_LENGTH_CODE = 257;
/** Distance codes 0..29, the same way. */
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577] as const;
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13] as const;
/** The fixed code writes every distance code in five bits. */
const DISTANCE_CODE_BITS = 5;

/** Which part of the stream a run of bits belongs to. */
export type PartKind = 'header' | 'literal' | 'length' | 'length-extra' | 'distance' | 'distance-extra' | 'end';
export interface Part {
  kind: PartKind;
  /** The bits in stream order, as '0' and '1' characters. */
  bits: string;
  /** What the part encodes, for a label: the symbol number, or the extra value. */
  detail: string;
}

/** One token's bits (or the header, or the end-of-block code), split into its parts. */
export interface Item {
  /** The token it encodes; null for the header and the end-of-block code. */
  token: Token | null;
  parts: Part[];
  bits: string;
}

const binary = (value: number, width: number): string => value.toString(2).padStart(width, '0');
/** The low `width` bits of a value, least significant first (how DEFLATE writes extra bits). */
const lsbFirst = (value: number, width: number): string => [...binary(value, width)].reverse().join('');

/** The fixed Huffman code of a literal/length symbol 0..287 (RFC 1951 3.2.6), most significant bit first. */
export function fixedLiteralCode(symbol: number): string {
  if (symbol < 0 || symbol > 287) throw new RangeError('literal/length symbols run from 0 to 287');
  if (symbol <= 143) return binary(0x30 + symbol, 8);
  if (symbol <= 255) return binary(0x190 + symbol - 144, 9);
  if (symbol <= 279) return binary(symbol - 256, 7);
  return binary(0xc0 + symbol - 280, 8);
}

/** The length symbol for a match length 3..258, and the extra bits that pick the exact length. */
export function lengthCode(length: number): { code: number; extraBits: number; extra: number } {
  if (length < DEFLATE_MIN_MATCH || length > MAX_MATCH) throw new RangeError(`DEFLATE lengths run from ${DEFLATE_MIN_MATCH} to ${MAX_MATCH}`);
  let i = LENGTH_BASE.length - 1;
  while (LENGTH_BASE[i] > length) i--;
  return { code: FIRST_LENGTH_CODE + i, extraBits: LENGTH_EXTRA[i], extra: length - LENGTH_BASE[i] };
}

/** The distance symbol for a distance 1..32768, and its extra bits. */
/** The farthest distance the format can name: the last bucket's base plus all its extra-bit values. */
export const MAX_DISTANCE = DISTANCE_BASE[DISTANCE_BASE.length - 1] + 2 ** DISTANCE_EXTRA[DISTANCE_EXTRA.length - 1] - 1;

export function distanceCode(distance: number): { code: number; extraBits: number; extra: number } {
  if (distance < 1 || distance > MAX_DISTANCE) throw new RangeError(`DEFLATE distances run from 1 to ${MAX_DISTANCE}`);
  let i = DISTANCE_BASE.length - 1;
  while (DISTANCE_BASE[i] > distance) i--;
  return { code: i, extraBits: DISTANCE_EXTRA[i], extra: distance - DISTANCE_BASE[i] };
}

/**
 * Tokens as the format can carry them: a match shorter than 3 has no length code, so it goes out as the
 * literals it stands for. `text` supplies those characters.
 */
export function deflateTokens(tokens: readonly Token[], text: string): Token[] {
  return tokens.flatMap((t): Token[] => {
    if (t.kind === 'literal' || t.length >= DEFLATE_MIN_MATCH) return [t];
    return Array.from({ length: t.length }, (_, k): Token => ({ kind: 'literal', char: text[t.pos + k], pos: t.pos + k, best: 0 }));
  });
}

function itemOf(token: Token): Item {
  if (token.kind === 'literal') {
    const code = token.char.charCodeAt(0);
    const bits = fixedLiteralCode(code);
    return { token, parts: [{ kind: 'literal', bits, detail: `literal ${code}` }], bits };
  }
  const len = lengthCode(token.length);
  const dist = distanceCode(token.distance);
  const parts: Part[] = [{ kind: 'length', bits: fixedLiteralCode(len.code), detail: `length code ${len.code}` }];
  if (len.extraBits > 0) parts.push({ kind: 'length-extra', bits: lsbFirst(len.extra, len.extraBits), detail: `+${len.extra}` });
  parts.push({ kind: 'distance', bits: binary(dist.code, DISTANCE_CODE_BITS), detail: `distance code ${dist.code}` });
  if (dist.extraBits > 0) parts.push({ kind: 'distance-extra', bits: lsbFirst(dist.extra, dist.extraBits), detail: `+${dist.extra}` });
  return { token, parts, bits: parts.map((p) => p.bits).join('') };
}

export interface Block {
  /** The header, one item per token, then the end-of-block code. */
  items: Item[];
  /** The whole stream as '0' and '1' characters, in stream order. */
  bits: string;
  /** The stream packed least-significant-bit first into bytes (the last byte padded with zeros). */
  bytes: Uint8Array;
  /** Stream length in bits, before padding. */
  totalBits: number;
}

/** Packs bits (stream order) into bytes, the first bit in the least significant place of byte 0. */
export function packBits(bits: string): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') bytes[i >> 3] |= 1 << (i & 7);
  return bytes;
}

/** Encodes tokens as one final fixed-Huffman block. Matches shorter than 3 must already be literals (`deflateTokens`). */
export function encodeFixedBlock(tokens: readonly Token[]): Block {
  const header: Item = { token: null, parts: [{ kind: 'header', bits: HEADER_BITS, detail: 'final block, fixed Huffman' }], bits: HEADER_BITS };
  const endBits = fixedLiteralCode(END_OF_BLOCK);
  const end: Item = { token: null, parts: [{ kind: 'end', bits: endBits, detail: 'end of block' }], bits: endBits };
  const items = [header, ...tokens.map(itemOf), end];
  const bits = items.map((i) => i.bits).join('');
  return { items, bits, bytes: packBits(bits), totalBits: bits.length };
}

// ── The browser's own compressor and decompressor ────────────────────

/** Whether this browser has the Compression Streams API with the raw DEFLATE format. */
export function streamsAvailable(): boolean {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return false;
  try {
    new DecompressionStream('deflate-raw');
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

async function throughStream(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** What the browser's own inflate makes of these bytes (text from bytes, Latin-1), or null where it is unavailable or the stream is invalid. */
export async function inflateRaw(bytes: Uint8Array): Promise<string | null> {
  if (!streamsAvailable()) return null;
  try {
    return Array.from(await throughStream(bytes, new DecompressionStream('deflate-raw')), (b) => String.fromCharCode(b)).join('');
  } catch {
    return null;
  }
}

/** The size in bytes of the browser's own raw DEFLATE compression of the text's bytes, or null where unavailable. */
export async function realCompressedSize(text: string): Promise<number | null> {
  if (!streamsAvailable()) return null;
  const input = Uint8Array.from(Array.from(text, (c) => c.charCodeAt(0)));
  try {
    return (await throughStream(input, new CompressionStream('deflate-raw'))).length;
  } catch {
    return null;
  }
}
