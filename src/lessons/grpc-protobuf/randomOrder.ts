import type { Rnd } from '../../core/random';
import { MAX_TAGS, type Order } from './model';

const WORDS = ['', 'testing', 'café', '日本語', 'a'.repeat(200), '😀 ok', ' ', 'a-b'];

/** A seeded Order across the whole value range (about one field in five is left at its default). Test helper. */
export function randomOrder(rnd: Rnd): Order {
  const bigId = (): bigint => {
    let v = 0n;
    for (let i = 0; i < 64; i++) v = (v << 1n) | (rnd() < 0.5 ? 0n : 1n);
    return BigInt.asIntN(64, v) >> BigInt(Math.floor(rnd() * 64));
  };
  const int32 = () => Math.floor((rnd() * 2 ** 32 - 2 ** 31) / 2 ** Math.floor(rnd() * 32));
  return {
    id: rnd() < 0.2 ? 0n : bigId(),
    item: WORDS[Math.floor(rnd() * WORDS.length)],
    qty: rnd() < 0.2 ? 0 : int32(),
    delta: rnd() < 0.2 ? 0 : int32(),
    tags: Array.from({ length: Math.floor(rnd() * (MAX_TAGS + 1)) }, int32),
  };
}
