/**
 * The state each scene opens in (pure functions, so a test can walk through every scene and check that none leaks into
 * another), and what the scenes compute from their controls.
 */
import { INSERT_MS, WORKERS } from './drain';
import {
  FEED_PAGE, THRESHOLDS, followerCount, makePopulation, mergeNewest, populationWork, pullCost, worstPostMs, type Population, type Post, type Work,
} from './feed';

export const FOLLOWEE_STEPS: readonly number[] = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_000];
export const RATIO_STEPS: readonly number[] = [0.05, 0.1, 0.2, 0.3, 0.5, 1, 3, 10, 30, 100];
export const POP_SEED = 1;
/** Posts per user per hour in the traffic mix of the hybrid scene. */
export const POSTS_PER_HOUR = 1;

export interface PushState {
  followersIdx: number;
  workers: number;
  insertMs: number;
}
export const initialPush = (): PushState => ({ followersIdx: 3, workers: WORKERS.default, insertMs: INSERT_MS.default });

export interface PullState {
  followeesIdx: number;
}
export const initialPull = (): PullState => ({ followeesIdx: 3 });

export interface HybridState {
  thresholdIdx: number;
  ratioIdx: number;
  seed: number;
}
export const initialHybrid = (): HybridState => ({ thresholdIdx: 4, ratioIdx: 5, seed: POP_SEED });

export type Detail = 'inactive' | 'deletes' | 'ordering' | 'ranked';
export interface DetailState {
  detail: Detail;
}
export const initialDetail = (): DetailState => ({ detail: 'inactive' });

/** A reader following a number of authors who each have a page of posts: the merge a pull read does, with the heap actual comparisons. */
export function measuredMerge(followees: number): { ops: number; estimate: number } {
  const lists: Post[][] = Array.from({ length: followees }, (_, i) =>
    Array.from({ length: FEED_PAGE }, (_, k) => ({ id: i * FEED_PAGE + k, author: i, time: (FEED_PAGE - k) * followees + ((i * 7919) % followees) })),
  );
  return { ops: mergeNewest(lists).ops, estimate: pullCost(followees) };
}

export interface HybridView {
  threshold: number;
  readsPerPost: number;
  push: Work;
  pull: Work;
  hybrid: Work;
  /** Reads per post at which pure push and pure pull cost the same on this population. */
  crossover: number;
  worstPushMs: number;
  worstHybridMs: number;
  celebrities: number;
}

/** Everything the hybrid scene shows, for one control state. Totals are linear in reads per post, so the crossover is solved from two evaluations. */
export function hybridView(p: Population, s: HybridState, workers = WORKERS.default, insertMs = INSERT_MS.default): HybridView {
  const threshold = THRESHOLDS[s.thresholdIdx];
  const readsPerPost = RATIO_STEPS[s.ratioIdx];
  const mix = { postsPerHourEach: POSTS_PER_HOUR, readsPerPost };
  const at = (r: number, strategy: 'push' | 'pull') => populationWork(p, strategy, 0, { postsPerHourEach: POSTS_PER_HOUR, readsPerPost: r }).total;
  const [push0, pull0, push1, pull1] = [at(0, 'push'), at(0, 'pull'), at(1, 'push'), at(1, 'pull')];
  return {
    threshold,
    readsPerPost,
    push: populationWork(p, 'push', 0, mix),
    pull: populationWork(p, 'pull', 0, mix),
    hybrid: populationWork(p, 'hybrid', threshold, mix),
    crossover: (push0 - pull0) / (pull1 - pull0 - (push1 - push0)),
    worstPushMs: worstPostMs(p, 'push', 0, workers, insertMs),
    worstHybridMs: worstPostMs(p, 'hybrid', threshold, workers, insertMs),
    celebrities: p.followers.filter((f) => f.length > threshold).length,
  };
}

export const populationFor = (seed: number) => makePopulation(seed);

/** The detail scene's one-line effects, each computed from the population. */
export const INACTIVE_SHARE_TEXT = '40%';
export const isInactive = (user: number) => user % 5 < 2;

export function topAuthor(p: Population): number {
  return p.followers.reduce((best, f, a) => (f.length > p.followers[best].length ? a : best), 0);
}

export function detailEffect(p: Population, detail: Detail): { title: string; effect: string } {
  const a = topAuthor(p);
  const followers = followerCount(p, a);
  if (detail === 'inactive') {
    const active = p.followers[a].filter((u) => !isInactive(u)).length;
    return {
      title: 'Inactive users',
      effect: `Skip the push for readers who have not logged in lately (here ${INACTIVE_SHARE_TEXT} of users, by id) and fill their inbox when they return: the most-followed author's post writes ${active} inboxes instead of ${followers}.`,
    };
  }
  if (detail === 'deletes') {
    return { title: 'Deletes and edits', effect: `Deleting that post is a second fan-out: ${followers} inboxes have to drop it, the same work as the post.` };
  }
  if (detail === 'ordering') {
    const [x, y] = [{ id: 1, author: 0, time: 5 }, { id: 2, author: 1, time: 5 }];
    const order = [x, y].sort((m, n) => n.time - m.time || n.id - m.id).map((q) => `post ${q.id}`).join(', then ');
    return { title: 'Ordering', effect: `Two posts at the same instant need a rule: by time, ties by id, newest first, gives ${order}.` };
  }
  return { title: 'A ranked feed', effect: `A ranked feed picks from many candidates at read time, so an inbox that keeps only the newest ${FEED_PAGE} posts is not enough; it has to see candidates and score them.` };
}
