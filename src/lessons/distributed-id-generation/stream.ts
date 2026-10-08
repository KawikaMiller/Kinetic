// A seeded stream of IDs of each kind, generated the way a real writer would: a clock that moves on
// by 0 to 2 ms between inserts, and the format's own generator.
import { mulberry32, randInt } from '../../core/random';
import { nextSnowflake, nextV7, seededBits, startSnowflake, TWITTER_EPOCH, ulidValue, uuidV4, type FormatId, type SnowflakeState, type V7State } from './formats';

export const START_MS = 1_700_000_000_000;
export const STREAM_SEED = 3;
/** Machine id the stream's single writer has. */
export const WRITER_MACHINE = 17;

/** `count` IDs of `kind` as 128- or 64-bit numbers; numeric order is the order a database index sorts them in. */
export function makeIds(kind: FormatId, count: number, seed = STREAM_SEED): bigint[] {
  const rnd = mulberry32(seed);
  const random = seededBits(mulberry32(seed + 1000));
  const ids: bigint[] = [];
  let ms = START_MS;
  let v7: V7State | null = null;
  let snow: SnowflakeState = startSnowflake();
  while (ids.length < count) {
    ms += randInt(0, 2, rnd);
    switch (kind) {
      case 'autoincrement':
        ids.push(BigInt(ids.length + 1));
        break;
      case 'uuidv4':
        ids.push(uuidV4(random));
        break;
      case 'uuidv7': {
        const r = nextV7(v7, ms, random);
        if ('wait' in r) break;
        v7 = r.state;
        ids.push(r.uuid);
        break;
      }
      case 'ulid':
        ids.push(ulidValue(ms, random(80)));
        break;
      case 'snowflake': {
        const r = nextSnowflake(snow, WRITER_MACHINE, ms - TWITTER_EPOCH, 'wait');
        if (r.id === null) break;
        snow = r.state;
        ids.push(r.id);
        break;
      }
    }
  }
  return ids;
}
