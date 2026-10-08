import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { beatTone } from './diagram';
import { beatCaption, patternFrames, raceFrames, raceVerdict } from './frames';
import type { Invalidation } from './model';
import {
  asideScript, behindOps, behindScript, BACKSTOP_TTL, PATTERN_TTL, PRICE, race, stalenessWindow, throughScript, type RaceConfig, type RaceId,
} from './races';
import { expiryCaption, keyCaption, spreadCaption, ttlCaption } from './captions';
import { expireHotKey, expireMany } from './stampede';
import { DEPENDS_ON, makeRequests, simulateKeys } from './keys';
import { simulateTtl, makeEvents } from './ttl';

const cfg = (over: Partial<RaceConfig> = {}): RaceConfig => ({ invalidate: 'set', ttl: null, lag: 5, ...over });
const IDS: RaceId[] = ['update-set', 'read-fill', 'replica-lag', 'ttl-only'];

describe('the pattern scripts', () => {
  it('cache-aside: miss, load, fill, hit, write, invalidate, miss, load, fill', () => {
    const { beats, final } = asideScript('delete');
    expect(beats.map((b) => b.kind)).toEqual(['miss', 'db-read', 'fill', 'hit', 'db-write', 'delete', 'miss', 'db-read', 'fill']);
    expect(beats.map((b) => b.view.cache)).toEqual([null, null, PRICE.old, PRICE.old, PRICE.old, null, null, null, PRICE.new]);
    expect(final.cache).toBe(PRICE.new);
    expect(final.db).toBe(PRICE.new);
  });

  it('cache-aside is stale for exactly one arrow: between its own database write and its invalidation', () => {
    for (const how of ['delete', 'set'] as Invalidation[]) {
      const { beats } = asideScript(how);
      const stale = beats.map((b) => b.stale);
      expect(stale.filter(Boolean)).toHaveLength(1);
      expect(beats[stale.indexOf(true)].kind).toBe('db-write');
    }
  });

  it('write-through: the cache is never behind the database, and the second read after a write hits', () => {
    const { beats, final } = throughScript();
    expect(beats.map((b) => b.kind)).toEqual(['miss', 'db-read', 'hit', 'cache-write', 'cache-db-write', 'hit']);
    expect(beats.every((b) => !b.stale)).toBe(true);
    expect(beats.at(-1)!.served!.value).toBe(PRICE.new);
    expect(final.db).toBe(PRICE.new);
    expect(final.cache).toBe(PRICE.new);
    // mid-write the cache is ahead of the database, which is not stale
    expect(beats[3].view).toMatchObject({ db: PRICE.old, cache: PRICE.new });
  });

  it('write-behind: with a crash the last two writes are lost and the database keeps the flushed value; without, none', () => {
    const crashed = behindScript(true);
    expect(crashed.map((b) => b.kind)).toEqual(['queue', 'queue', 'flush', 'queue', 'queue', 'crash']);
    expect(crashed.at(-1)!.lostNow).toBe(2);
    expect(crashed.at(-1)!.state).toMatchObject({ db: '$12', cache: null, lost: 2 });
    expect(crashed.map((b) => b.view.queued)).toEqual([1, 2, 0, 1, 2, 0]);
    const fine = behindScript(false);
    expect(fine.at(-1)!.state).toMatchObject({ db: '$14', lost: 0 });
    expect(behindOps(true)).toHaveLength(6);
  });
});

describe('the races, as scripted', () => {
  it('update then set with overwrites ends with the database at $15 and the cache at $12, and the next read serves it', () => {
    const r = race('update-set', cfg());
    expect(r.afterRace).toEqual({ db: PRICE.other, cache: PRICE.new, stale: true });
    expect(r.firstRead).toMatchObject({ value: PRICE.new, stale: true, fromCache: true });
    expect(r.beats.slice(0, 4).map((b) => b.label)).toEqual(['UPDATE price=$12', 'UPDATE price=$15', 'SET price=$15', 'SET price=$12']);
    expect(r.beats.slice(0, 4).map((b) => b.client)).toEqual(['A', 'B', 'B', 'A']);
    expect(r.afterTtl).toBeNull();
  });

  it('the same interleaving with delete leaves nothing stale and the next read loads the database value', () => {
    const r = race('update-set', cfg({ invalidate: 'delete' }));
    expect(r.afterRace).toEqual({ db: PRICE.other, cache: null, stale: false });
    expect(r.firstRead).toMatchObject({ value: PRICE.other, stale: false });
  });

  it('a TTL backstop heals the stale entry at TTL after it was stored, with a fresh read', () => {
    const r = race('update-set', cfg({ ttl: BACKSTOP_TTL }));
    expect(r.staleUntil).toBe(4 + BACKSTOP_TTL);
    expect(r.afterTtl).toMatchObject({ value: PRICE.other, stale: false });
    expect(r.beats.some((b) => b.kind === 'ttl')).toBe(true);
    const ttlIndex = r.beats.findIndex((b) => b.kind === 'ttl');
    expect(r.beats[ttlIndex - 1].stale).toBe(true);
    expect(r.beats[ttlIndex].view.cache).toBeNull();
    expect(r.beats[ttlIndex].stale).toBe(false);
  });

  it('read fills late: the reader stores the old $10 after the writer has deleted, whichever way the writer invalidates', () => {
    for (const invalidate of ['delete', 'set'] as Invalidation[]) {
      const r = race('read-fill', cfg({ invalidate }));
      expect(r.afterRace).toEqual({ db: PRICE.new, cache: PRICE.old, stale: true });
      expect(r.beats.at(r.raceEnd)!.kind).toBe('fill');
      expect(r.beats.at(r.raceEnd)!.served).toMatchObject({ value: PRICE.old, stale: true });
    }
  });

  it('a TTL is what ends the read-fill race', () => {
    const r = race('read-fill', cfg({ invalidate: 'delete', ttl: BACKSTOP_TTL }));
    expect(r.staleUntil).toBe(5 + BACKSTOP_TTL);
    expect(r.afterTtl).toMatchObject({ value: PRICE.new, stale: false });
  });

  it('replica lag: the fill is stale exactly when the lag is over three seconds', () => {
    for (let lag = 0; lag <= 8; lag++) {
      const r = race('replica-lag', cfg({ lag }));
      expect(r.afterRace.stale, `lag ${lag}`).toBe(lag > 3);
      expect(r.afterRace.cache).toBe(lag > 3 ? PRICE.old : PRICE.new);
      const read = r.beats.find((b) => b.kind === 'replica-read')!;
      expect(read.note).toBe(`returns ${lag > 3 ? PRICE.old : PRICE.new}`);
    }
  });

  it('TTL only: a read after the write is served stale, then the entry expires and the next read is fresh', () => {
    for (const ttl of [10, 30, 60]) {
      const r = race('ttl-only', cfg({ ttl }));
      expect(r.firstRead).toMatchObject({ value: PRICE.old, stale: true });
      expect(r.staleUntil).toBe(3 + ttl);
      expect(r.afterTtl).toMatchObject({ value: PRICE.new, stale: false });
      const kinds = r.beats.map((b) => b.kind);
      expect(kinds).toEqual(['miss', 'db-read', 'fill', 'db-write', 'hit', 'ttl', 'miss', 'db-read', 'fill']);
      expect(r.beats[4].served!.stale).toBe(true);
    }
  });

  it('TTL only at the slider minimum: the entry expires before the late read, so the read is fresh but the window is still drawn', () => {
    const r = race('ttl-only', cfg({ ttl: 5 }));
    expect(r.staleUntil).toBeNull();
    expect(r.beats.at(-1)!.stale).toBe(false);
    const w = stalenessWindow(5);
    expect(w.expiry).toBe(8);
    expect(w.window).toBe(2);
    expect(Number.isFinite(w.domain[1])).toBe(true);
  });

  it('the staleness window is the TTL minus the three seconds before the write', () => {
    for (const ttl of [5, 10, 30, 60]) {
      const w = stalenessWindow(ttl);
      expect(w.write).toBe(6);
      expect(w.expiry).toBe(3 + ttl);
      expect(w.window).toBe(ttl - 3);
      const stale = w.bars.filter((b) => b.stale);
      expect(stale).toHaveLength(1);
      expect(stale[0]).toMatchObject({ lane: 'cache', start: w.write, end: w.expiry, value: PRICE.old });
    }
  });

  it('a beat is flagged stale only when the cache holds something other than the database, and a stale hit is flagged', () => {
    for (const id of IDS) for (const invalidate of ['delete', 'set'] as Invalidation[]) for (const ttl of [null, 30]) {
      const r = race(id, cfg({ invalidate, ttl }));
      for (const beat of r.beats) {
        if (beat.stale) expect(beat.view.cache).not.toBeNull();
        if (beat.stale) expect(beat.view.cache).not.toBe(beat.view.db);
        if (beat.kind === 'hit' && beat.served!.stale) expect(beat.stale).toBe(true);
      }
    }
  });
});

describe('captions', () => {
  it('every beat of every script and race reads cleanly and quotes its own values', () => {
    const scripts = [asideScript('delete'), asideScript('set'), throughScript()];
    for (const { beats } of scripts) {
      beats.forEach((_, i) => expectCaption(beatCaption(beats, i, PATTERN_TTL)));
    }
    const behind = behindScript(true);
    behind.forEach((_, i) => expectCaption(beatCaption(behind, i, null)));
    expect(expectCaption(beatCaption(behind, 5, null))).toContain('2 queued writes were only ever in its memory');
    expect(expectCaption(beatCaption(behind, 5, null))).toContain('the database still holds $12');
    for (const [i, beat] of behind.entries()) {
      if (beat.kind === 'queue') expect(expectCaption(beatCaption(behind, i, null))).toMatch(/^The app writes /);
    }
  });

  it('a stale hit says it is stale and names both values; a fresh hit does not', () => {
    const r = race('ttl-only', cfg({ ttl: 30 }));
    const text = expectCaption(beatCaption(r.beats, 4, 30));
    expect(text).toContain('$10');
    expect(text).toContain('already holds $12');
    expect(text).toContain('stale read');
    const fresh = asideScript('delete');
    expect(expectCaption(beatCaption(fresh.beats, 3, 60))).not.toContain('stale');
  });

  it('a stale fill blames the replica when it read from one, and the undone invalidation when it did not', () => {
    const lag = race('replica-lag', cfg({ lag: 5 }));
    const fill = lag.beats.findIndex((b) => b.kind === 'fill');
    expect(expectCaption(beatCaption(lag.beats, fill, null))).toContain('replica that was behind');
    const fillRace = race('read-fill', cfg({ invalidate: 'delete' }));
    const f = fillRace.beats.findIndex((b) => b.kind === 'fill');
    expect(expectCaption(beatCaption(fillRace.beats, f, null))).toContain('invalidation is undone');
  });

  it('the TTL expiry caption says the stale value stops being served only when it was stale', () => {
    const stale = race('ttl-only', cfg({ ttl: 30 }));
    const i = stale.beats.findIndex((b) => b.kind === 'ttl');
    expect(expectCaption(beatCaption(stale.beats, i, 30))).toContain('stale value is no longer served');
  });

  it('race frames run: intro, one per arrow, verdict; the race-ending arrow says how the race ended', () => {
    for (const id of IDS) {
      const r = race(id, cfg({ ttl: id === 'ttl-only' ? 30 : null }));
      const frames = raceFrames(r, 'set', 5);
      expect(frames).toHaveLength(r.beats.length + 2);
      expect(frames[0].index).toBe(-1);
      frames.forEach((f) => expectCaption(f.say));
      expect(expectCaption(frames[r.raceEnd + 1].say)).toContain('The race is over');
      expect(expectCaption(frames[r.raceEnd + 1].say)).toContain(`database holds ${r.afterRace.db}`);
    }
  });

  it('the verdict matches what the race produced: stale without a TTL is permanent, with one it is bounded, fresh says so', () => {
    expect(expectCaption(raceVerdict(race('update-set', cfg())))).toContain('stays stale until another write');
    const bounded = expectCaption(raceVerdict(race('update-set', cfg({ ttl: 30 }))));
    expect(bounded).toContain('at 34 s the entry expires');
    expect(bounded).toContain('$15');
    expect(expectCaption(raceVerdict(race('update-set', cfg({ invalidate: 'delete' }))))).toContain('leaves nothing stale');
    expect(expectCaption(raceVerdict(race('replica-lag', cfg({ lag: 2 }))))).toContain('leaves nothing stale');
  });

  it('pattern frames add the intro and the point around the arrows', () => {
    const s = asideScript('delete');
    const frames = patternFrames(s.beats, 'intro text here', 'closing point here', PATTERN_TTL);
    expect(frames).toHaveLength(s.beats.length + 2);
    expect(frames.map((f) => f.index)).toEqual([-1, ...s.beats.map((_, i) => i), s.beats.length - 1]);
  });

  it('arrow tones follow the colour table: hit green, miss red (the costly side), fill yellow, database blue, delete violet, stale orange, crash red', () => {
    const aside = asideScript('delete').beats;
    expect(aside.map(beatTone)).toEqual(['bad', 'info', 'hi', 'ok', 'info', 'violet', 'bad', 'info', 'hi']);
    const stale = race('ttl-only', cfg({ ttl: 30 })).beats;
    expect(beatTone(stale[4])).toBe('orange');
    expect(beatTone(behindScript(true).at(-1)!)).toBe('bad');
    const fill = race('read-fill', cfg({ invalidate: 'delete' })).beats.find((b) => b.kind === 'fill' && b.served?.stale)!;
    expect(beatTone(fill)).toBe('orange');
  });
});

describe('the other scenes\' captions', () => {
  it('the TTL caption quotes the replay\'s own numbers', () => {
    const r = simulateTtl(makeEvents(), 30);
    const text = expectCaption(ttlCaption(r));
    expect(text).toContain('30 s TTL');
    expect(text).toContain(`${(r.hitRate * 100).toFixed(1)}%`);
    expect(text).toContain(`${r.maxStaleness.toFixed(1)} s`);
  });

  it('the stampede captions quote loads, misses and the busiest second', () => {
    const herd = expireHotKey(200, false, 3);
    const single = expireHotKey(200, true, 3);
    expect(expectCaption(expiryCaption(200, false, herd))).toContain(`${herd.loads} loads`);
    expect(expectCaption(expiryCaption(200, true, single))).toContain('1 load');
    expect(expectCaption(expiryCaption(200, true, single))).toContain(`other ${single.waited} wait`);
    const same = expireMany(200, 60, 0, 3);
    const jit = expireMany(200, 60, 0.2, 3);
    expect(expectCaption(spreadCaption(0, 200, 60, same))).toContain('200 database loads in one second');
    expect(expectCaption(spreadCaption(0.2, 200, 60, jit))).toContain(`at most ${jit.peak} loads`);
  });

  it('the key caption names what is missing or extra, with the run\'s counts', () => {
    const reqs = makeRequests();
    const noLocale = { user: false, locale: false, version: true };
    const run = simulateKeys('catalog', noLocale, reqs);
    const text = expectCaption(keyCaption('catalog', noLocale, run));
    expect(text).toContain('leaves out the locale');
    expect(text).toContain(`${run.wrong} requests`);
    const greedy = simulateKeys('catalog', { user: true, locale: true, version: true }, reqs);
    expect(expectCaption(keyCaption('catalog', { user: true, locale: true, version: true }, greedy))).toContain('fragments the cache');
    const exact = simulateKeys('account', DEPENDS_ON.account, reqs);
    expect(expectCaption(keyCaption('account', DEPENDS_ON.account, exact))).toContain('no wrong pages');
  });
});
