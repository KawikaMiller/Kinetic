import { describe, expect, it } from 'vitest';
import { fakeSecret } from '../../core/fakeSecret';
import { mulberry32, pick, shuffle, type Rnd } from '../../core/random';
import {
  CLASSES, monthlyBill, PRICES, presign, readAfterWrite, sign, STALE_READS, toUrl, verify, withReadBack, type Method, type Presigned, type Usage,
} from './access';
import { DEMO_KEYS, entryOf, listAll, listObjects, type Entry } from './listing';
import {
  assemble, bytesAt, checkParts, completionOrder, CONCURRENCY, FAIL_AT, MAX_PARTS, MIN_PART, partStatesAt, planParts, RETRY_DELAY_S, schedule,
} from './multipart';
import { BLOCK, BUCKET, FILE_SIZE, httpLines, KIB, MIB, OPS, outcome, renameSteps, stepCount, STORES, type OpId, type StoreId } from './store';

describe('operation costs, worked by hand', () => {
  const GIB_FREE = 0;
  const table: Record<OpId, Record<StoreId, { bytes: number; requests: number; tone: 'ok' | 'bad'; atomic: boolean }>> = {
    append: {
      block: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      file: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      // 40 MiB is 41,943,040 bytes, plus the 100-byte line.
      object: { bytes: 41_943_040 + 100, requests: 1, tone: 'bad', atomic: true },
    },
    rename: {
      block: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      file: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      // Three keys under reports/ (38 + 41 + 40 MiB), each copied and then deleted.
      object: { bytes: (38 + 41 + 40) * 1_048_576, requests: 6, tone: 'bad', atomic: false },
    },
    range: {
      block: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      file: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      // Bytes 1 through 100, inclusive.
      object: { bytes: 100, requests: 1, tone: 'ok', atomic: true },
    },
    list: {
      block: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      file: { bytes: 4096, requests: 1, tone: 'ok', atomic: true },
      // Three keys at about 100 bytes each, one page.
      object: { bytes: 300, requests: 1, tone: 'ok', atomic: true },
    },
  };

  it.each(OPS.flatMap((op) => STORES.map((store) => [op, store] as const)))('%s on %s', (op, store) => {
    const o = outcome(op, store);
    const want = table[op][store];
    expect([o.bytes, o.requests, o.tone, o.atomic]).toEqual([want.bytes, want.requests, want.tone, want.atomic]);
    expect(o.verdict.length).toBeGreaterThan(10);
    expect(GIB_FREE).toBe(0);
  });

  it('the object store is never cheaper than the block store for append and rename, and cheaper for a range read', () => {
    for (const op of ['append', 'rename'] as const) expect(outcome(op, 'object').bytes).toBeGreaterThan(outcome(op, 'block').bytes);
    expect(outcome('range', 'object').bytes).toBeLessThan(outcome('range', 'block').bytes);
  });

  it('the bucket holds the file, and the sizes add up', () => {
    expect(BUCKET.find((o) => o.key === 'reports/2026/q3.csv')!.size).toBe(FILE_SIZE);
    expect(FILE_SIZE).toBe(40 * MIB);
    expect(BLOCK).toBe(4 * KIB);
  });
});

describe('the object rename, request by request', () => {
  const steps = renameSteps();
  const keys = (i: number) => steps[i].rows.map((r) => r.key);

  it('copies each key first, then deletes the old ones, so for a while both prefixes exist', () => {
    expect(steps).toHaveLength(7);
    expect(stepCount('rename')).toBe(6);
    expect(steps.map((s) => s.rows.length)).toEqual([5, 6, 7, 8, 7, 6, 5]);
    expect(steps[1].request).toBe('PUT /archive/2025/q4.csv  x-amz-copy-source: /example-reports/reports/2025/q4.csv');
    expect(steps[4].request).toBe('DELETE /reports/2025/q4.csv');
    // Halfway through (three copies done, nothing deleted) every key exists twice.
    expect(keys(3).filter((k) => k.startsWith('reports/'))).toHaveLength(3);
    expect(keys(3).filter((k) => k.startsWith('archive/'))).toHaveLength(3);
    // At the end only the new prefix is left, with the same sizes.
    expect(keys(6).sort()).toEqual(['archive/2025/q4.csv', 'archive/2026/q2.csv', 'archive/2026/q3.csv', 'logs/app.log', 'readme.txt']);
    const size = (i: number, k: string) => steps[i].rows.find((r) => r.key === k)!.size;
    expect(size(6, 'archive/2026/q3.csv')).toBe(size(0, 'reports/2026/q3.csv'));
  });

  it('there is a state a reader could see that is neither the before nor the after', () => {
    const before = keys(0).sort().join();
    const after = keys(6).sort().join();
    expect(steps.slice(1, 6).every((s) => s.rows.map((r) => r.key).sort().join() !== before && s.rows.map((r) => r.key).sort().join() !== after)).toBe(true);
  });

  it('the other operations take one step, and each has an HTTP exchange', () => {
    for (const op of ['append', 'range', 'list'] as const) expect(stepCount(op)).toBe(1);
    expect(httpLines('range')).toContain('Range: bytes=1-100');
    expect(httpLines('range')).toContain(`Content-Range: bytes 1-100/${FILE_SIZE}`);
    expect(httpLines('range')).toContain('Content-Length: 100');
    expect(httpLines('rename')).toHaveLength(6);
  });
});

// ---------- listing ----------

/** An independent reference: classify every key with a Set, then cut the whole list into pages. */
function referencePages(keys: string[], prefix: string, delimiter: string | null, maxKeys: number): Entry[][] {
  const seen = new Set<string>();
  const all: Entry[] = [];
  for (const key of keys.filter((k) => k.startsWith(prefix)).sort()) {
    const rest = key.slice(prefix.length);
    const at = delimiter === null ? -1 : rest.indexOf(delimiter);
    const entry: Entry = at < 0 ? { kind: 'key', name: key } : { kind: 'prefix', name: prefix + rest.slice(0, at + (delimiter?.length ?? 0)) };
    const id = `${entry.kind}:${entry.name}`;
    if (entry.kind === 'prefix' && seen.has(id)) continue;
    seen.add(id);
    all.push(entry);
  }
  const pages: Entry[][] = [];
  for (let i = 0; i < Math.max(1, all.length); i += maxKeys) pages.push(all.slice(i, i + maxKeys));
  return pages;
}

describe('listObjects', () => {
  it('hand-worked: the top level folds everything under a slash into common prefixes', () => {
    const page = listObjects(DEMO_KEYS, { prefix: '', delimiter: '/', maxKeys: 1000, after: null });
    expect(page.entries).toEqual([
      { kind: 'prefix', name: 'images/' },
      { kind: 'prefix', name: 'logs/' },
      { kind: 'key', name: 'readme.txt' },
      { kind: 'prefix', name: 'reports-draft/' },
      { kind: 'prefix', name: 'reports/' },
    ]);
    expect(page.truncated).toBe(false);
  });

  it('hand-worked: reports/ with a delimiter, in pages of two', () => {
    const pages = listAll(DEMO_KEYS, 'reports/', '/', 2);
    expect(pages.map((p) => p.entries.map((e) => e.name))).toEqual([['reports/', 'reports/2025/'], ['reports/2026/', 'reports/index.html']]);
    expect(pages.map((p) => p.truncated)).toEqual([true, false]);
    expect(pages[0].next).toEqual({ kind: 'prefix', name: 'reports/2025/' });
  });

  it('a key that contains the delimiter twice shows as its first folder, once', () => {
    expect(entryOf('reports/2026/q3.csv', '', '/')).toEqual({ kind: 'prefix', name: 'reports/' });
    expect(entryOf('reports/2026/q3.csv', 'reports/', '/')).toEqual({ kind: 'prefix', name: 'reports/2026/' });
    expect(entryOf('reports/2026/q3.csv', 'reports/2026/', '/')).toEqual({ kind: 'key', name: 'reports/2026/q3.csv' });
    expect(entryOf('reports/2026/q3.csv', '', null)).toEqual({ kind: 'key', name: 'reports/2026/q3.csv' });
  });

  it('without a delimiter every key under the prefix is listed, once', () => {
    const all = listAll(DEMO_KEYS, 'reports', null, 3).flatMap((p) => p.entries.map((e) => e.name));
    expect(all).toEqual(DEMO_KEYS.filter((k) => k.startsWith('reports')).sort());
  });

  it('matches the reference, page by page, over the demo keys and many prefixes, delimiters and page sizes', () => {
    for (const prefix of ['', 'r', 'reports', 'reports/', 'reports/2026/', 'reports/2026/q3.csv', 'images/', 'logs/2026/1', 'zzz']) {
      for (const delimiter of [null, '/', '-', '2', '/2']) {
        for (let maxKeys = 1; maxKeys <= 7; maxKeys++) {
          const got = listAll(DEMO_KEYS, prefix, delimiter, maxKeys);
          const want = referencePages(DEMO_KEYS, prefix, delimiter, maxKeys);
          expect(got.map((p) => p.entries)).toEqual(want);
          got.forEach((p, i) => expect(p.truncated).toBe(i < got.length - 1));
        }
      }
    }
  });

  it('matches the reference over 300 random key sets, including keys that equal a prefix or end in the delimiter', () => {
    const alphabet = ['a', 'b', '/', '/', '-'];
    const randomKey = (rnd: Rnd) => Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => pick(alphabet, rnd)).join('');
    for (let seed = 1; seed <= 300; seed++) {
      const rnd = mulberry32(seed);
      const keys = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => randomKey(rnd)))];
      const prefix = rnd() < 0.5 ? '' : pick(keys, rnd).slice(0, Math.floor(rnd() * 3));
      const delimiter = pick([null, '/', '-', 'ab'], rnd);
      const maxKeys = 1 + Math.floor(rnd() * 5);
      expect(listAll(keys, prefix, delimiter, maxKeys).map((p) => p.entries)).toEqual(referencePages(keys, prefix, delimiter, maxKeys));
      // Folding hides nothing: every matching key is a listed key or sits under a listed prefix.
      const entries = listAll(keys, prefix, delimiter, maxKeys).flatMap((p) => p.entries);
      for (const k of keys.filter((x) => x.startsWith(prefix))) expect(entries.some((e) => (e.kind === 'key' ? e.name === k : k.startsWith(e.name)))).toBe(true);
    }
  });

  it('refuses a page size below one and an empty delimiter', () => {
    expect(() => listObjects(DEMO_KEYS, { prefix: '', delimiter: null, maxKeys: 0, after: null })).toThrow(RangeError);
    expect(() => listObjects(DEMO_KEYS, { prefix: '', delimiter: '', maxKeys: 5, after: null })).toThrow(RangeError);
  });

  it('an empty bucket and a prefix with no keys give one empty page', () => {
    expect(listAll([], '', '/', 3)).toEqual([{ entries: [], truncated: false, next: null }]);
    expect(listAll(DEMO_KEYS, 'nothing/', '/', 3)[0].entries).toEqual([]);
  });
});

// ---------- multipart ----------

describe('multipart upload', () => {
  const parts = (size: number) => planParts(FILE_SIZE, size * MIB);

  it('plans contiguous parts: all the same size but the last, summing to the object', () => {
    for (let mib = 1; mib <= 60; mib++) {
      const p = parts(mib);
      expect(p).toHaveLength(Math.ceil(40 / mib));
      expect(p.reduce((n, x) => n + x.size, 0)).toBe(FILE_SIZE);
      p.forEach((x, i) => {
        expect(x.number).toBe(i + 1);
        expect(x.offset).toBe(i * mib * MIB);
        if (i < p.length - 1) expect(x.size).toBe(mib * MIB);
      });
    }
    expect(parts(8).map((x) => x.size / MIB)).toEqual([8, 8, 8, 8, 8]);
    expect(parts(7).map((x) => x.size / MIB)).toEqual([7, 7, 7, 7, 7, 5]);
    expect(planParts(0, MIB)).toEqual([]);
  });

  it('every part but the last must reach the minimum: exhaustively for part sizes of 1 to 60 MiB', () => {
    for (let mib = 1; mib <= 60; mib++) {
      const result = checkParts(parts(mib));
      const onePart = parts(mib).length === 1;
      expect(result.ok).toBe(mib * MIB >= MIN_PART || onePart);
      if (!result.ok) expect(result.error).toContain('EntityTooSmall');
    }
    // The last part may be small: 33 MiB then 7 MiB, and 36 MiB then 4 MiB.
    expect(checkParts(parts(33)).ok).toBe(true);
    expect(checkParts(parts(36)).ok).toBe(true);
    expect(checkParts(planParts(10 * MIB, 5 * MIB - 1)).ok).toBe(false);
  });

  it('refuses more than 10,000 parts', () => {
    const many = planParts(MAX_PARTS + 1, 1);
    const r = checkParts(many, 1);
    expect(r.ok).toBe(false);
    expect(checkParts(planParts(MAX_PARTS, 1), 1).ok).toBe(true);
  });

  const attemptsFor = (mib: number, failPart: number | null, seed: number) => {
    const p = parts(mib);
    return { p, a: schedule(p, { failPart, seed }) };
  };

  it('every part uploads successfully exactly once; only a failed part is retried, alone, after it failed', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const failPart of [null, 1, 3, 5]) {
        const { p, a } = attemptsFor(8, failPart, seed);
        for (const part of p) {
          const mine = a.filter((x) => x.part === part.number);
          expect(mine.filter((x) => x.ok)).toHaveLength(1);
          if (part.number === failPart) {
            expect(mine.map((x) => [x.attempt, x.ok])).toEqual([[1, false], [2, true]]);
            expect(mine[1].start).toBeGreaterThanOrEqual(mine[0].end + RETRY_DELAY_S);
          } else expect(mine.map((x) => x.attempt)).toEqual([1]);
        }
        expect(a).toHaveLength(p.length + (failPart === null ? 0 : 1));
      }
    }
  });

  it('never runs more attempts at once than there are connections, and parts finish out of order', () => {
    let outOfOrder = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { p, a } = attemptsFor(5, seed % 2 ? 2 : null, seed);
      for (const x of a) expect(a.filter((y) => y.start <= x.start && y.end > x.start).length).toBeLessThanOrEqual(CONCURRENCY);
      const order = completionOrder(a);
      expect(order.slice().sort((m, n) => m - n)).toEqual(p.map((x) => x.number));
      if (order.join() !== p.map((x) => x.number).join()) outOfOrder += 1;
    }
    expect(outOfOrder).toBeGreaterThan(0);
  });

  it('parts reassemble byte-identically in part-number order, whatever order they finished in', () => {
    const MIN = 1000;
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = mulberry32(seed);
      const size = 1 + Math.floor(rnd() * 20_000);
      const data = Uint8Array.from({ length: size }, () => Math.floor(rnd() * 256));
      const partSize = MIN + Math.floor(rnd() * 5000);
      const planned = planParts(size, partSize);
      const uploaded = shuffle(planned, rnd).map((x) => ({ number: x.number, data: data.slice(x.offset, x.offset + x.size) }));
      const result = assemble(uploaded, MIN);
      expect(result.ok).toBe(true);
      if (result.ok) expect(Array.from(result.data)).toEqual(Array.from(data));
    }
  });

  it('Complete is refused when a part other than the last is too small, and the object is not created', () => {
    const data = (n: number) => new Uint8Array(n);
    const bad = assemble([{ number: 2, data: data(2000) }, { number: 1, data: data(500) }, { number: 3, data: data(2000) }], 1000);
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(bad.error).toContain('part 1');
    expect(assemble([{ number: 1, data: data(2000) }, { number: 2, data: data(10) }], 1000).ok).toBe(true);
  });

  it('part states and byte counts follow the attempts', () => {
    const { p, a } = attemptsFor(8, 2, 3);
    expect(partStatesAt(p, a, 0).filter((s) => s === 'uploading')).toHaveLength(CONCURRENCY);
    expect(partStatesAt(p, a, 0).filter((s) => s === 'pending')).toHaveLength(p.length - CONCURRENCY);
    const end = Math.max(...a.map((x) => x.end));
    expect(partStatesAt(p, a, end)).toEqual(p.map(() => 'done'));
    const failed = a.find((x) => !x.ok)!;
    const retry = a.find((x) => x.attempt === 2)!;
    expect(partStatesAt(p, a, failed.end)[1]).toBe('failed');
    expect(partStatesAt(p, a, retry.start)[1]).toBe('retrying');
    expect(bytesAt(p, a, 0)).toEqual({ sent: 0, wasted: 0, done: 0 });
    const last = bytesAt(p, a, end);
    expect(last.done).toBe(FILE_SIZE);
    expect(last.wasted).toBeCloseTo(p[1].size * FAIL_AT);
    expect(last.sent).toBeCloseTo(FILE_SIZE + p[1].size * FAIL_AT);
  });

  it('is deterministic for a seed', () => {
    const p = parts(8);
    expect(schedule(p, { failPart: 2, seed: 5 })).toEqual(schedule(p, { failPart: 2, seed: 5 }));
  });
});

// ---------- access and money ----------

describe('presigned links', () => {
  const secret = fakeSecret('demo-', 'signing-', 'key');
  const issued = 1_000_000;
  const link = presign(secret, 'GET', 'reports/2026/q3.csv', issued, 600);

  it('works until it expires, inclusive, and not after', () => {
    expect(link.expires).toBe(issued + 600);
    expect(verify(secret, link, issued)).toBe('ok');
    expect(verify(secret, link, issued + 600)).toBe('ok');
    expect(verify(secret, link, issued + 601)).toBe('expired');
  });

  it('any change to the method, the key, the expiry or the signature is refused, and so is a different secret', () => {
    const tampered: Presigned[] = [
      { ...link, method: 'PUT' },
      { ...link, key: 'reports/2026/q2.csv' },
      { ...link, expires: link.expires + 3600 },
      { ...link, signature: link.signature.replace(/.$/, (c) => (c === '0' ? '1' : '0')) },
    ];
    for (const t of tampered) expect(verify(secret, t, issued + 1)).toBe('bad-signature');
    expect(verify(fakeSecret('other-', 'key'), link, issued + 1)).toBe('bad-signature');
    // A tampered link that is also expired is refused for its signature first.
    expect(verify(secret, tampered[1], issued + 9999)).toBe('bad-signature');
  });

  it('signatures differ whenever what they grant differs, and repeat for the same grant', () => {
    const seen = new Set<string>();
    let total = 0;
    for (const method of ['GET', 'PUT'] as Method[]) {
      for (const key of ['a', 'b', 'a/b', 'reports/2026/q3.csv']) {
        for (const expires of [100, 101, 5000]) {
          seen.add(sign(secret, method, key, expires));
          total += 1;
          expect(sign(secret, method, key, expires)).toBe(sign(secret, method, key, expires));
        }
      }
    }
    expect(seen.size).toBe(total);
  });

  it('the URL carries the permission, the expiry and the signature, and not the secret', () => {
    const url = toUrl(link);
    expect(url).toContain('reports/2026/q3.csv?method=GET');
    expect(url).toContain(`expires=${link.expires}`);
    expect(url).toContain(`signature=${link.signature}`);
    expect(url).not.toContain(secret);
  });
});

describe('consistency', () => {
  it('strong: every read after a write sees the new version; eventual: the first reads may still see the old one', () => {
    for (let reads = 0; reads < 6; reads++) {
      expect(readAfterWrite('strong', reads)).toBe('new');
      expect(readAfterWrite('eventual', reads)).toBe(reads < STALE_READS ? 'old' : 'new');
    }
  });
});

describe('the price model', () => {
  const usage: Usage = { storedGb: 100, writes: 10_000, reads: 1_000_000, readBackGb: 10, egressGb: 20 };

  it('matches a hand-worked month for the standard and archive classes', () => {
    const std = monthlyBill('standard', usage);
    expect(std.storage).toBeCloseTo(100 * 0.023);
    expect(std.requests).toBeCloseTo(10 * 0.005 + 1000 * 0.0004);
    expect(std.retrieval).toBe(0);
    expect(std.egress).toBeCloseTo(20 * 0.09);
    expect(std.total).toBeCloseTo(2.3 + 0.45 + 0 + 1.8);
    const arc = monthlyBill('archive', usage);
    expect(arc.total).toBeCloseTo(0.4 + (0.3 + 2.0) + 0.3 + 1.8);
  });

  it('is linear in every part of the usage, and the total is the sum of its parts', () => {
    for (const cls of CLASSES) {
      const one = monthlyBill(cls, usage);
      const three = monthlyBill(cls, { storedGb: 300, writes: 30_000, reads: 3_000_000, readBackGb: 30, egressGb: 60 });
      expect(three.total).toBeCloseTo(one.total * 3, 9);
      expect(one.total).toBeCloseTo(one.storage + one.requests + one.retrieval + one.egress, 12);
      expect(monthlyBill(cls, { storedGb: 0, writes: 0, reads: 0, readBackGb: 0, egressGb: 0 }).total).toBe(0);
    }
  });

  it('read requests also get dearer as the class gets colder', () => {
    expect(PRICES.infrequent.per1000Reads).toBeGreaterThan(PRICES.standard.per1000Reads);
    expect(PRICES.archive.per1000Reads).toBeGreaterThan(PRICES.infrequent.per1000Reads);
  });

  it('lowering Read back pulls Sent to internet down with it, and never raises it', () => {
    const u: Usage = { storedGb: 1, writes: 0, reads: 0, readBackGb: 100, egressGb: 100 };
    expect(withReadBack(u, 0).egressGb).toBe(0);
    expect(withReadBack(u, 40).egressGb).toBe(40);
    expect(withReadBack({ ...u, egressGb: 10 }, 40).egressGb).toBe(10);
  });

  it('the colder the class, the cheaper to store and the dearer to read back', () => {
    expect(PRICES.archive.storage).toBeLessThan(PRICES.infrequent.storage);
    expect(PRICES.infrequent.storage).toBeLessThan(PRICES.standard.storage);
    expect(PRICES.archive.retrievalPerGb).toBeGreaterThan(PRICES.infrequent.retrievalPerGb);
    expect(PRICES.infrequent.retrievalPerGb).toBeGreaterThan(PRICES.standard.retrievalPerGb);
  });
});
