/**
 * fanout-feeds: three ways to build a news feed, over a seeded scaled-down population, in abstract work units.
 *
 * - push (fan-out on write): a post is written into every follower's inbox; a read is the newest N of one inbox.
 * - pull (fan-out on read): a post is stored once; a read merges the newest posts of everyone the reader follows.
 * - hybrid: authors with more than `threshold` followers are pulled, everyone else is pushed; a read merges the inbox
 *   with the celebrities the reader follows.
 * A feed is the newest `FEED_PAGE` posts of the people a reader follows, ordered by (time, id), newest first. The
 * brute-force feed (collect, sort, take N) is the oracle all three must equal.
 */
import { zipfSampler } from '../../core/distributions';
import { mulberry32, shuffle } from '../../core/random';

export const USERS = 2000;
export const FEED_PAGE = 20;
export const ZIPF_S = 0.8;
export const POSTS_PER_USER = 3;
export const FOLLOWEES = { min: 5, max: 45 } as const;

export interface Post {
  id: number;
  author: number;
  time: number;
}
export interface Population {
  users: number;
  followees: number[][];
  followers: number[][];
  posts: Post[];
}

export interface PopulationOptions {
  users?: number;
  followees?: { min: number; max: number };
  postsPerUser?: number;
}

/** A seeded population: who follows whom (popular authors drawn by a Zipf law over a shuffled ranking) and the posts, in time order. */
export function makePopulation(seed: number, o: PopulationOptions = {}): Population {
  const users = o.users ?? USERS;
  const range = o.followees ?? FOLLOWEES;
  const rnd = mulberry32(seed);
  const popularity = shuffle(Array.from({ length: users }, (_, i) => i), rnd);
  const draw = zipfSampler(users, ZIPF_S);
  const followees: number[][] = [];
  const followers: number[][] = Array.from({ length: users }, () => []);
  for (let u = 0; u < users; u++) {
    const want = Math.min(users - 1, range.min + Math.floor(rnd() * (range.max - range.min + 1)));
    const chosen = new Set<number>();
    for (let tries = 0; chosen.size < want && tries < want * 40; tries++) {
      const a = popularity[draw(rnd) - 1];
      if (a !== u) chosen.add(a);
    }
    const list = [...chosen].sort((x, y) => x - y);
    followees.push(list);
    for (const a of list) followers[a].push(u);
  }
  const posts: Post[] = Array.from({ length: users * (o.postsPerUser ?? POSTS_PER_USER) }, (_, i) => ({ id: i, author: Math.floor(rnd() * users), time: i }));
  return { users, followees, followers, posts };
}

export const followerCount = (p: Population, author: number) => p.followers[author].length;

/** Newest first: later time first, ties by higher id. */
const newer = (a: Post, b: Post) => b.time - a.time || b.id - a.id;

/** The oracle: every post of every followee, sorted, the first N. */
export function bruteFeed(p: Population, reader: number, n = FEED_PAGE, deleted: ReadonlySet<number> = new Set()): number[] {
  const follows = new Set(p.followees[reader]);
  return p.posts.filter((x) => follows.has(x.author) && !deleted.has(x.id)).sort(newer).slice(0, n).map((x) => x.id);
}

/** A binary max-heap over posts that counts the comparisons it makes. */
class CountingHeap {
  comparisons = 0;
  private items: { post: Post; list: number }[] = [];
  private before(a: number, b: number) {
    this.comparisons++;
    return newer(this.items[a].post, this.items[b].post) < 0;
  }
  get size() {
    return this.items.length;
  }
  /** Build the heap from the first entries in one bottom-up pass (about 2F comparisons at most, not F log F). */
  heapify(items: { post: Post; list: number }[]) {
    this.items = items.slice();
    for (let start = (this.items.length >> 1) - 1; start >= 0; start--) this.siftDown(start);
  }
  private siftDown(from: number) {
    let i = from;
    for (;;) {
      const [l, r] = [2 * i + 1, 2 * i + 2];
      let best = i;
      if (l < this.items.length && this.before(l, best)) best = l;
      if (r < this.items.length && this.before(r, best)) best = r;
      if (best === i) return;
      [this.items[i], this.items[best]] = [this.items[best], this.items[i]];
      i = best;
    }
  }
  push(item: { post: Post; list: number }) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }
  pop(): { post: Post; list: number } {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }
}

export interface Merge {
  ids: number[];
  /** Comparisons the heap made: the actual work of the merge. */
  ops: number;
}

/**
 * A k-way merge of lists already sorted newest first: the first entry of each goes in the heap, then N pops, each followed
 * by pushing the next entry of the list it came from.
 */
export function mergeNewest(lists: readonly (readonly Post[])[], n = FEED_PAGE): Merge {
  const heap = new CountingHeap();
  const at = lists.map(() => 0);
  heap.heapify(lists.flatMap((l, i) => (l.length > 0 ? [{ post: l[0], list: i }] : [])));
  const ids: number[] = [];
  while (ids.length < n && heap.size > 0) {
    const top = heap.pop();
    ids.push(top.post.id);
    at[top.list]++;
    if (at[top.list] < lists[top.list].length) heap.push({ post: lists[top.list][at[top.list]], list: top.list });
  }
  return { ids, ops: heap.comparisons };
}

/** Each author's posts, newest first, minus the deleted ones. */
function postsByAuthor(p: Population, deleted: ReadonlySet<number>): Post[][] {
  const by: Post[][] = Array.from({ length: p.users }, () => []);
  for (const post of p.posts) if (!deleted.has(post.id)) by[post.author].push(post);
  for (const l of by) l.sort(newer);
  return by;
}

export type Strategy = 'push' | 'pull' | 'hybrid';
export const STRATEGIES: readonly Strategy[] = ['push', 'pull', 'hybrid'];

export interface FeedBuild {
  /** The strategy's feed of every reader. */
  feeds: number[][];
  /** Inbox writes done by fan-out (and removals, for deletes). */
  inserts: number;
  removals: number;
  /** Heap comparisons spent building all the feeds. */
  readOps: number;
}

export interface BuildOptions {
  threshold: number;
  deleted?: ReadonlySet<number>;
  /** Broken variant: a hybrid that forgets to merge celebrity posts into the feed. */
  forgetCelebrities?: boolean;
}

/** Build every reader's feed the way `strategy` does, counting the work. `threshold`: authors with more followers than this are pulled (hybrid). */
export function buildFeeds(p: Population, strategy: Strategy, o: BuildOptions): FeedBuild {
  const deleted = o.deleted ?? new Set<number>();
  const pulled = (a: number) => (strategy === 'pull' ? true : strategy === 'push' ? false : followerCount(p, a) > o.threshold);
  const inbox: Post[][] = Array.from({ length: p.users }, () => []);
  let inserts = 0;
  let removals = 0;
  for (const post of p.posts) {
    if (pulled(post.author)) continue;
    for (const f of p.followers[post.author]) {
      inbox[f].push(post);
      inserts++;
    }
  }
  for (const id of deleted) {
    const post = p.posts[id];
    if (pulled(post.author)) continue;
    for (const f of p.followers[post.author]) {
      const i = inbox[f].findIndex((x) => x.id === id);
      if (i >= 0) {
        inbox[f].splice(i, 1);
        removals++;
      }
    }
  }
  const by = postsByAuthor(p, deleted);
  let readOps = 0;
  const feeds = p.followees.map((follows, reader) => {
    const lists: Post[][] = [];
    const mine = inbox[reader].slice().sort(newer);
    if (mine.length > 0) lists.push(mine);
    if (!(strategy === 'hybrid' && o.forgetCelebrities)) for (const a of follows) if (pulled(a)) lists.push(by[a]);
    const m = mergeNewest(lists);
    readOps += m.ops;
    return m.ids;
  });
  return { feeds, inserts, removals, readOps };
}

/* ---------- the scenes' work model ---------- */

/** The analytic estimate of a pull read with F followees: F + N log2 F. */
export const pullCost = (followees: number, n = FEED_PAGE) => followees + n * Math.log2(Math.max(2, followees));

/**
 * One author with `followers` followers, pushed or pulled. Per post: push writes `followers` inboxes (and a read costs 1); pull
 * writes once (and a read costs the merge, F followees). The read:write ratio, in reads per post, where the two cost the same.
 */
export function crossoverReads(followers: number, followees: number): number {
  return (followers - 1) / (pullCost(followees) - 1);
}

/** Total work per hour of one author's posts: `posts` posts and `reads` reads of their content, each by a reader with F followees. */
export function authorWork(strategy: Exclude<Strategy, 'hybrid'>, o: { followers: number; followees: number; posts: number; reads: number }): { writes: number; reads: number } {
  return strategy === 'push'
    ? { writes: o.posts * o.followers, reads: o.reads }
    : { writes: o.posts, reads: o.reads * pullCost(o.followees) };
}

/** Time until the last follower can see a post: the fan-out tasks split over `workers`, each insert taking `insertMs`. */
export const fanoutMs = (followers: number, workers: number, insertMs: number) => Math.ceil(followers / workers) * insertMs;

/** The hybrid's totals over the population for a traffic mix; see `populationWork`. */
export interface Work {
  writes: number;
  reads: number;
  total: number;
}

/**
 * Work per hour over a whole population for `strategy`: every user posts `postsPerHourEach` times and the readers read
 * `readsPerPost` times per post in all (spread over readers evenly, each costing what that reader's feed costs). Writes are
 * inbox inserts (push, or the pushed part of the hybrid) plus one store per post; reads are the cost of each reader's merge.
 */
export function populationWork(p: Population, strategy: Strategy, threshold: number, mix: { postsPerHourEach: number; readsPerPost: number }): Work {
  const pulled = (a: number) => (strategy === 'pull' ? true : strategy === 'push' ? false : followerCount(p, a) > threshold);
  const posts = p.users * mix.postsPerHourEach;
  const writes = posts + p.followers.reduce((sum, f, a) => sum + (pulled(a) ? 0 : f.length * mix.postsPerHourEach), 0);
  const perRead = p.followees.reduce((sum, follows) => {
    const pulledFollowed = follows.filter(pulled).length;
    const hasInbox = follows.some((a) => !pulled(a));
    // A read of the inbox alone is one read; a merge counts the inbox as one more list next to the pulled authors.
    return sum + (pulledFollowed === 0 ? 1 : pullCost(pulledFollowed + (hasInbox ? 1 : 0)));
  }, 0) / p.users;
  const reads = posts * mix.readsPerPost * perRead;
  return { writes, reads, total: writes + reads };
}

/** The slowest fan-out of any post under `strategy`: the most-followed author whose posts are pushed, split over the workers (a pulled post is one store). */
export function worstPostMs(p: Population, strategy: Strategy, threshold: number, workers: number, insertMs: number): number {
  const pushed = p.followers.map((f) => f.length).filter((n) => (strategy === 'pull' ? false : strategy === 'push' ? true : n <= threshold));
  return fanoutMs(Math.max(1, ...pushed), workers, insertMs);
}

export const THRESHOLDS: readonly number[] = [0, 10, 20, 50, 100, 200, 500, 1000, Infinity];
