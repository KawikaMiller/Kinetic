import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { fmtBytes, fmtMs, ormFrames, shortSql, summaryRow } from './frames';
import { STRATEGIES, pageComments, runStrategy, stopsFor, timeline, type Scene } from './model';

const SCENES: Scene[] = ['authors', 'nested'];

describe('frames: every scene x strategy x size x latency', () => {
  for (const scene of SCENES)
    for (const s of STRATEGIES)
      it(`${scene} / ${s.id}`, () => {
        for (const n of [10, 20, 100, 200])
          for (const latency of [0.2, 5, 20]) {
            const run = runStrategy(scene, s.id, n);
            const tl = timeline(run.queries, latency);
            const frames = ormFrames(scene, s.id, run, latency);
            const stops = stopsFor(run.queries.length);
            expect(frames.map((f) => f.shown)).toEqual([0, ...stops, run.queries.length]);
            for (const f of frames.slice(1, -1)) {
              expect(text(f.say)).toContain(`${f.shown} ${f.shown === 1 ? 'query' : 'queries'} so far, ${fmtMs(tl.items[f.shown - 1].end)}`);
              expect(text(f.say)).toContain(`${fmtMs(f.shown * latency)} was only waiting`);
              expect(f.line).toBe(run.queries[f.shown - 1].line);
            }
            const last = text(frames.at(-1)!.say);
            expect(last).toContain(`${run.queries.length} ${run.queries.length === 1 ? 'query' : 'queries'}, ${fmtMs(tl.total)}, ${fmtBytes(tl.bytes)}`);
            expect(last).toContain(`${Math.round((tl.waiting / tl.total) * 100)}% of the time`);
          }
      });

  it('the first stop of every strategy names the posts query and its rows', () => {
    for (const s of STRATEGIES) {
      const run = runStrategy('authors', s.id, 20);
      if (s.id === 'join') continue;
      expect(text(ormFrames('authors', s.id, run, 5)[1].say)).toContain('Query 1 loads the page\'s 20 posts');
    }
  });
});

describe('captions say the right thing about each strategy', () => {
  it('lazy: the repeats are called one query for each item; the fixes never say that', () => {
    const lazy = ormFrames('authors', 'lazy', runStrategy('authors', 'lazy', 20), 5);
    expect(lazy.slice(2).every((f) => /one query for each item/.test(text(f.say)) || f === lazy.at(-1))).toBe(true);
    for (const s of ['join', 'batch', 'loader'] as const)
      for (const f of ormFrames('authors', s, runStrategy('authors', s, 20), 5)) expect(text(f.say)).not.toMatch(/one query for each item/);
  });

  it('batch and loader name how many ids the one query carries (distinct authors on the page)', () => {
    const run = runStrategy('authors', 'batch', 20);
    const distinct = new Set(run.page.map((p) => p.author)).size;
    for (const s of ['batch', 'loader'] as const) expect(text(ormFrames('authors', s, runStrategy('authors', s, 20), 5)[2].say)).toContain(`${distinct} ids at once`);
    expect(text(ormFrames('authors', 'loader', run, 5)[2].say)).toContain('collected');
    expect(text(ormFrames('authors', 'batch', run, 5)[2].say)).not.toContain('collected');
  });

  it('the nested join names its row count, more than the posts it returns', () => {
    const run = runStrategy('nested', 'join', 20);
    const say = text(ormFrames('nested', 'join', run, 5)[1].say);
    expect(say).toContain(`${run.queries[0].rows.length} rows`);
    expect(run.queries[0].rows.length).toBeGreaterThan(20);
  });

  it('nested lazy: stops that mix comment and commenter repeats name both', () => {
    const frames = ormFrames('nested', 'lazy', runStrategy('nested', 'lazy', 20), 5);
    expect(frames.some((f) => /a post's comments and a commenter/.test(text(f.say)) || /a commenter and a post's comments/.test(text(f.say)))).toBe(true);
    expect(pageComments(20)).toBeGreaterThan(0);
  });
});

describe('summary row', () => {
  it('matches the run it summarises', () => {
    const run = runStrategy('nested', 'batch', 50);
    const row = summaryRow('nested', 'batch', 50, 5);
    expect(row.count).toBe(run.queries.length);
    expect(row.total).toBe(timeline(run.queries, 5).total);
    expect(row.bytes).toBe(run.queries.reduce((s, q) => s + q.bytes, 0));
  });
});

describe('display helpers', () => {
  it('shortens a long IN list but never a short one, keeping the id count honest', () => {
    expect(shortSql('SELECT * FROM a WHERE id IN (1, 2, 3)')).toBe('SELECT * FROM a WHERE id IN (1, 2, 3)');
    expect(shortSql('SELECT * FROM a WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8)')).toBe('SELECT * FROM a WHERE id IN (1, 2, 3, 4, … 8 ids)');
    expect(shortSql('SELECT 1')).toBe('SELECT 1');
  });

  it('formats milliseconds to a readable precision', () => {
    expect(fmtMs(0.2)).toBe('0.20 ms');
    expect(fmtMs(12.34)).toBe('12.3 ms');
    expect(fmtMs(1234.5)).toBe('1235 ms');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
  });
});
