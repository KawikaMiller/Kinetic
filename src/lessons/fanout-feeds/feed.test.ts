import { describe, expect, it } from 'vitest';
import { harmonic, zipfSampler } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import {
  FEED_PAGE, USERS, ZIPF_S, authorWork, bruteFeed, buildFeeds, crossoverReads, fanoutMs, followerCount, makePopulation, mergeNewest, populationWork, pullCost, worstPostMs, type Post, type Strategy,
} from './feed';

const small = (seed: number) => makePopulation(seed, { users: 60 + (seed % 5) * 20, followees: { min: 2, max: 14 }, postsPerUser: 4 });

describe('the three strategies build exactly the brute-force feed', () => {
  it('push, pull and hybrid (three thresholds) equal collect-sort-take-N for every reader of 200 seeded populations: same posts, same order, no duplicates', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = small(seed);
      const thresholds = [0, 3 + (seed % 7), Infinity];
      for (const strategy of ['push', 'pull'] as Strategy[]) {
        const { feeds } = buildFeeds(p, strategy, { threshold: 0 });
        feeds.forEach((f, reader) => {
          expect(f, `${strategy} seed ${seed} reader ${reader}`).toEqual(bruteFeed(p, reader));
          expect(new Set(f).size).toBe(f.length);
        });
      }
      for (const threshold of thresholds) {
        const { feeds } = buildFeeds(p, 'hybrid', { threshold });
        feeds.forEach((f, reader) => expect(f, `hybrid T=${threshold} seed ${seed} reader ${reader}`).toEqual(bruteFeed(p, reader)));
      }
    }
  });

  it('after a delete no strategy shows the post, and the feeds still equal the oracle without it', () => {
    for (let seed = 0; seed < 40; seed++) {
      const p = small(seed);
      const rnd = mulberry32(seed + 9);
      const deleted = new Set(p.posts.filter(() => rnd() < 0.2).map((x) => x.id));
      for (const strategy of ['push', 'pull', 'hybrid'] as Strategy[]) {
        const { feeds } = buildFeeds(p, strategy, { threshold: 5, deleted });
        feeds.forEach((f, reader) => {
          expect(f.some((id) => deleted.has(id)), `${strategy} seed ${seed}`).toBe(false);
          expect(f).toEqual(bruteFeed(p, reader, FEED_PAGE, deleted));
        });
      }
    }
  });

  it('broken variant: a hybrid that forgets to merge celebrity posts is missing posts for readers who follow a celebrity, and the oracle catches it', () => {
    let caught = 0;
    for (let seed = 0; seed < 200; seed++) {
      const p = small(seed);
      const { feeds } = buildFeeds(p, 'hybrid', { threshold: 4, forgetCelebrities: true });
      const wrong = feeds.filter((f, reader) => JSON.stringify(f) !== JSON.stringify(bruteFeed(p, reader)));
      const followsCelebrity = (reader: number) => p.followees[reader].some((a) => followerCount(p, a) > 4);
      for (const [reader, f] of feeds.entries()) {
        if (!followsCelebrity(reader)) expect(f).toEqual(bruteFeed(p, reader));
      }
      if (wrong.length > 0) caught++;
    }
    expect(caught).toBeGreaterThan(150);
  });
});

describe('the work counts equal independent counters', () => {
  it('push inserts equal the number of (post, follower) pairs, counted straight off the follow edges; pull makes no inserts', () => {
    for (let seed = 0; seed < 60; seed++) {
      const p = small(seed);
      let pairs = 0;
      for (const post of p.posts) for (const reader of p.followees.keys()) if (p.followees[reader].includes(post.author)) pairs++;
      expect(buildFeeds(p, 'push', { threshold: 0 }).inserts, `seed ${seed}`).toBe(pairs);
      expect(buildFeeds(p, 'pull', { threshold: 0 }).inserts).toBe(0);
      expect(buildFeeds(p, 'hybrid', { threshold: Infinity }).inserts).toBe(pairs);
      expect(buildFeeds(p, 'hybrid', { threshold: 0 }).inserts).toBe(0);
    }
  });

  it('the hybrid\'s inserts are the pairs whose author is at or below the threshold', () => {
    const p = small(3);
    for (const t of [2, 5, 9]) {
      let pairs = 0;
      for (const post of p.posts) if (followerCount(p, post.author) <= t) for (const reader of p.followees.keys()) if (p.followees[reader].includes(post.author)) pairs++;
      expect(buildFeeds(p, 'hybrid', { threshold: t }).inserts).toBe(pairs);
    }
  });

  it('deleting a pushed post removes it from every follower\'s inbox: one removal per follower', () => {
    const p = small(4);
    const id = p.posts.find((x) => followerCount(p, x.author) > 0)!.id;
    const author = p.posts[id].author;
    expect(buildFeeds(p, 'push', { threshold: 0, deleted: new Set([id]) }).removals).toBe(followerCount(p, author));
    expect(buildFeeds(p, 'pull', { threshold: 0, deleted: new Set([id]) }).removals).toBe(0);
  });

  it('a heap merge of F lists for N items costs about F + N log2 F comparisons: between half and 2.5 times over 100 random shapes (a binary heap makes up to two comparisons a level)', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const F = 2 + Math.floor(rnd() * 400);
      let t = 0;
      const lists: Post[][] = Array.from({ length: F }, () => Array.from({ length: FEED_PAGE }, () => ({ id: t, author: 0, time: t++ })).reverse());
      const m = mergeNewest(lists);
      expect(m.ids).toHaveLength(FEED_PAGE);
      expect(m.ops).toBeGreaterThan(pullCost(F) / 2);
      expect(m.ops).toBeLessThan(pullCost(F) * 2.5);
    }
  });

  it('the crossover read:write ratio is where push and pull cost the same, and about followers / (F + N log F)', () => {
    for (const [followers, followees] of [[100, 40], [5_000, 60], [100_000, 25], [10, 40]]) {
      const r = crossoverReads(followers, followees);
      const push = authorWork('push', { followers, followees, posts: 1, reads: r });
      const pull = authorWork('pull', { followers, followees, posts: 1, reads: r });
      expect(push.writes + push.reads).toBeCloseTo(pull.writes + pull.reads, 6);
      expect(r / (followers / pullCost(followees))).toBeGreaterThan(0.8);
      expect(r / (followers / pullCost(followees))).toBeLessThan(1.3);
    }
  });

  it('fan-out time is the number of tasks over the workers times the insert time, rounded up to whole tasks per worker', () => {
    expect(fanoutMs(100_000, 10, 1)).toBe(10_000);
    expect(fanoutMs(95, 10, 2)).toBe(20);
    expect(fanoutMs(10, 50, 1)).toBe(1);
  });
});

describe('the seeded population is heavy-tailed', () => {
  const p = makePopulation(1);
  it('has the scaled-down size and a few authors with far more followers than the median (most have tens)', () => {
    expect(p.users).toBe(USERS);
    const counts = p.followers.map((f) => f.length).sort((a, b) => b - a);
    const median = counts[Math.floor(counts.length / 2)];
    expect(counts[0]).toBeGreaterThan(20 * median);
    expect(median).toBeLessThan(100);
  });
  it('the most popular authors are followed by nearly every reader, as the Zipf law predicts (1 - (1 - p1)^F averaged over the readers), and few authors are celebrities', () => {
    const top = Math.max(...p.followers.map((f) => f.length)) / USERS;
    const p1 = 1 / harmonic(USERS, ZIPF_S);
    const meanF = p.followees.reduce((s, f) => s + (1 - (1 - p1) ** f.length), 0) / USERS;
    expect(Math.abs(top - meanF)).toBeLessThan(0.05);
    expect(p.followers.filter((f) => f.length > 500).length / USERS).toBeLessThan(0.05);
  });
  it('uses the shared Zipf sampler (a draw is a rank in 1..n)', () => {
    const draw = zipfSampler(10, 1);
    const rnd = mulberry32(1);
    for (let i = 0; i < 100; i++) expect(draw(rnd)).toBeGreaterThanOrEqual(1);
  });
});

describe('the traffic-mix totals', () => {
  const p = makePopulation(2, { users: 300 });
  const mix = { postsPerHourEach: 1, readsPerPost: 10 };
  it('push, pull and hybrid agree at the extremes: threshold 0 is pure pull, infinity is pure push', () => {
    expect(populationWork(p, 'hybrid', 0, mix)).toEqual(populationWork(p, 'pull', 0, mix));
    expect(populationWork(p, 'hybrid', Infinity, mix)).toEqual(populationWork(p, 'push', 0, mix));
  });
  it('push beats pull at a high read:write ratio on reads, pull beats push when posts dominate: the totals cross', () => {
    const lowReads = { postsPerHourEach: 1, readsPerPost: 0.05 };
    const highReads = { postsPerHourEach: 1, readsPerPost: 200 };
    expect(populationWork(p, 'pull', 0, lowReads).total).toBeLessThan(populationWork(p, 'push', 0, lowReads).total);
    expect(populationWork(p, 'push', 0, highReads).total).toBeLessThan(populationWork(p, 'pull', 0, highReads).total);
  });
  it('on a heavy-tailed population the hybrid never costs less in total than the cheaper of push and pull (near the crossover it costs more than both), and its worst post is far faster than the worst push post', () => {
    const big = makePopulation(1);
    for (const readsPerPost of [0.05, 0.3, 1, 10]) {
      const m = { postsPerHourEach: 1, readsPerPost };
      const push = populationWork(big, 'push', 0, m).total;
      const pull = populationWork(big, 'pull', 0, m).total;
      for (const t of [10, 100, 500]) {
        const h = populationWork(big, 'hybrid', t, m).total;
        expect(h, `r=${readsPerPost} T=${t}`).toBeGreaterThanOrEqual(Math.min(push, pull) - 1e-6);
      }
    }
    const near = { postsPerHourEach: 1, readsPerPost: 0.2 };
    expect(populationWork(big, 'hybrid', 100, near).total).toBeGreaterThan(Math.max(populationWork(big, 'push', 0, near).total, populationWork(big, 'pull', 0, near).total));
    const pushWorst = worstPostMs(big, 'push', 0, 10, 1);
    expect(worstPostMs(big, 'hybrid', 100, 10, 1)).toBeLessThan(pushWorst / 5);
    expect(worstPostMs(big, 'hybrid', 0, 10, 1)).toBe(worstPostMs(big, 'pull', 0, 10, 1));
    expect(worstPostMs(big, 'hybrid', Infinity, 10, 1)).toBe(pushWorst);
  });
});
