import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { fullBucket, refill, takeToken, type Bucket, type BucketParams } from './tokenBucket';

const P: BucketParams = { rate: 2, capacity: 5 };

describe('token bucket', () => {
  it('starts full and lets a burst of exactly `capacity` through at one instant', () => {
    let b = fullBucket(P);
    const allowed: boolean[] = [];
    for (let i = 0; i < P.capacity + 2; i++) {
      const r = takeToken(b, 0, P);
      allowed.push(r.allowed);
      b = r.bucket;
    }
    expect(allowed).toEqual([true, true, true, true, true, false, false]);
  });

  it('refills at `rate` per second and never past capacity', () => {
    const empty: Bucket = { tokens: 0, last: 10 };
    expect(refill(empty, 11, P)).toEqual({ tokens: 2, last: 11 });
    expect(refill(empty, 100, P)).toEqual({ tokens: P.capacity, last: 100 });
  });

  it('a refusal still moves the clock, so the same time is not credited twice', () => {
    const r = takeToken({ tokens: 0, last: 0 }, 0.25, P);
    expect(r.allowed).toBe(false);
    expect(r.bucket).toEqual({ tokens: 0.5, last: 0.25 });
    expect(takeToken(r.bucket, 0.5, P).allowed).toBe(true);
  });

  it('Retry-After is the whole seconds until one token is back', () => {
    expect(takeToken({ tokens: 0.2, last: 0 }, 0, { rate: 1, capacity: 5 }).retryAfter).toBe(1);
    expect(takeToken({ tokens: 0, last: 0 }, 0, { rate: 0.25, capacity: 5 }).retryAfter).toBe(4);
    expect(takeToken(fullBucket(P), 0, P).retryAfter).toBe(0);
  });

  it('never lets more than capacity + rate × span through in any span', () => {
    const rnd = mulberry32(7);
    let b = fullBucket(P);
    let t = 0;
    const passed: number[] = [];
    for (let i = 0; i < 2000; i++) {
      t += rnd() * 0.2;
      const r = takeToken(b, t, P);
      b = r.bucket;
      if (r.allowed) passed.push(t);
    }
    const over: string[] = [];
    for (let i = 0; i < passed.length; i++) {
      for (let j = i; j < passed.length; j++) {
        if (j - i + 1 > P.capacity + (passed[j] - passed[i]) * P.rate + 1e-9) over.push(`${passed[i]}..${passed[j]}`);
      }
    }
    expect(passed.length).toBeGreaterThan(P.capacity);
    expect(over).toEqual([]);
  });
});
