// Turning a generated ID into what the anatomy scene shows: its bits, its text and its fields decoded.
// The generator closes over its own state; the clock and the randomness come in, so tests pin both.
import type { Bit, BitGroup } from '../../core/bits';
import type { Tone } from '../../core/tone';
import {
  bitsOfBig, decodeSnowflake, LAYOUTS, nextSnowflake, nextV7, startSnowflake, TWITTER_EPOCH, ulidMillis, ulidText, ulidValue, uuidText, uuidV4,
  uuidV7Millis, uuidVariant, uuidVersion,
  type FieldKind, type FormatId, type RandomBits, type SnowflakeState, type V7State,
} from './formats';
import { WRITER_MACHINE } from './stream';

export const FIELD_TONE: Record<FieldKind, Tone> = {
  time: 'info',
  machine: 'violet',
  sequence: 'orange',
  random: 'sky',
  version: 'hi',
  counter: 'muted',
  sign: 'dim',
};

export const FORMAT_NAMES: Record<FormatId, string> = {
  autoincrement: 'Auto-increment',
  uuidv4: 'UUIDv4',
  uuidv7: 'UUIDv7',
  ulid: 'ULID',
  snowflake: 'Snowflake-style',
};

/** The longest run of bits drawn as one bracket: a strip wraps between brackets only, so long fields are cut to fit a phone. */
export const MAX_RUN = 16;

/** A field's brackets: the first carries the label, the rest of a long field continue it unlabelled. */
export function groupsOf(format: FormatId): BitGroup[] {
  return LAYOUTS[format].fields.flatMap((f) => {
    const runs: BitGroup[] = [];
    for (let from = f.from; from <= f.to; from += MAX_RUN) {
      runs.push({ from, to: Math.min(f.to, from + MAX_RUN - 1), tone: FIELD_TONE[f.kind], label: from === f.from ? f.label : undefined });
    }
    return runs;
  });
}

export interface Decoded {
  label: string;
  value: string;
  tone: Tone;
}

export interface Shown {
  bits: Bit[];
  text: string;
  decoded: Decoded[];
}

const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC');

/** An ID as the page shows it: bits, the text people see, and the fields read back out of it. */
export function show(format: FormatId, id: bigint): Shown {
  const bits = bitsOfBig(id, LAYOUTS[format].bits);
  switch (format) {
    case 'autoincrement':
      return { bits, text: id.toString(), decoded: [{ label: 'counter', value: `${id} (row number ${id} ever made)`, tone: FIELD_TONE.counter }] };
    case 'uuidv4':
      return {
        bits,
        text: uuidText(id),
        decoded: [
          { label: 'version', value: String(uuidVersion(id)), tone: 'hi' },
          { label: 'variant', value: `${uuidVariant(id).toString(2)} (RFC 9562)`, tone: 'hi' },
          { label: 'random', value: '122 bits, everything else', tone: 'sky' },
        ],
      };
    case 'uuidv7':
      return {
        bits,
        text: uuidText(id),
        decoded: [
          { label: 'time', value: iso(uuidV7Millis(id)), tone: 'info' },
          { label: 'version', value: String(uuidVersion(id)), tone: 'hi' },
          { label: 'counter / random', value: `rand_a ${(id >> 64n) & 0xfffn}`, tone: 'sky' },
        ],
      };
    case 'ulid':
      return {
        bits,
        text: ulidText(id),
        decoded: [
          { label: 'time', value: iso(ulidMillis(id)), tone: 'info' },
          { label: 'random', value: '80 bits', tone: 'sky' },
        ],
      };
    case 'snowflake': {
      const f = decodeSnowflake(id);
      return {
        bits,
        text: id.toString(),
        decoded: [
          { label: 'time', value: iso(f.time + TWITTER_EPOCH), tone: 'info' },
          { label: 'machine', value: String(f.machine), tone: 'violet' },
          { label: 'sequence', value: String(f.sequence), tone: 'orange' },
        ],
      };
    }
  }
}

export interface Generator {
  /** The next ID. If the format has to wait for the next millisecond it takes it. */
  next: () => bigint;
}

/** A generator for `format`, reading the time from `clock` (Unix ms) and bits from `random`. */
export function createGenerator(format: FormatId, clock: () => number, random: RandomBits, machine = WRITER_MACHINE): Generator {
  let counter = 0n;
  let v7: V7State | null = null;
  let snow: SnowflakeState = startSnowflake();
  let skew = 0;
  return {
    next() {
      switch (format) {
        case 'autoincrement':
          counter += 1n;
          return counter;
        case 'uuidv4':
          return uuidV4(random);
        case 'ulid':
          return ulidValue(clock(), random(80));
        case 'uuidv7':
          for (;;) {
            const r = nextV7(v7, clock() + skew, random);
            v7 = r.state;
            if ('uuid' in r) return r.uuid;
            skew += 1;
          }
        case 'snowflake':
          for (;;) {
            const r = nextSnowflake(snow, machine, clock() + skew - TWITTER_EPOCH, 'wait');
            snow = r.state;
            if (r.id !== null) return r.id;
            skew += 1;
          }
      }
    },
  };
}

