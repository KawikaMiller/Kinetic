/**
 * A tiny relationship-based checker in the style of the published Zanzibar design (from memory, chipped on screen):
 * relationship tuples plus rewrite rules, and a check that walks them. Written for this lesson; it is not any product.
 */
import { folderId, SHARE, type Action, type Org } from './org';

export type Subject = { kind: 'user'; id: string } | { kind: 'set'; obj: string; rel: string } | { kind: 'object'; obj: string };

export interface Tuple {
  obj: string;
  rel: string;
  subject: Subject;
}

/** `rel` of an object, written the way the lesson shows it: `doc:roadmap#viewer`. */
export const setName = (obj: string, rel: string) => `${obj}#${rel}`;
export const subjectName = (s: Subject) => (s.kind === 'user' ? `user:${s.id}` : s.kind === 'object' ? s.obj : setName(s.obj, s.rel));

/** The rewrite rules, as data: what else counts as holding a relation. */
export const REWRITES: readonly { rel: string; text: string; from: { kind: 'same'; rel: string } | { kind: 'parent'; rel: string } }[] = [
  { rel: 'viewer', text: 'viewers of the parent folder are viewers', from: { kind: 'parent', rel: 'viewer' } },
  { rel: 'viewer', text: 'editors are viewers', from: { kind: 'same', rel: 'editor' } },
  { rel: 'editor', text: 'editors of the parent folder are editors', from: { kind: 'parent', rel: 'editor' } },
];

export const group = (dept: string, clearance: number) => `group:${dept}-${clearance}`;
export const folder = (dept: string, level: number) => `folder:${folderId(dept, level)}`;
export const docObj = (id: string) => `doc:${id}`;

/**
 * The tuples for an organisation. A group is "clearance at least k in a department": a user is a direct member of
 * the group for their own clearance, and each group is nested in the one below, so higher clearance reaches lower
 * groups. A folder lets the group of its level view it and the group one level up edit it.
 */
export function generateTuples(org: Org): Tuple[] {
  const t: Tuple[] = [];
  for (const d of org.docs) t.push({ obj: docObj(d.id), rel: 'parent', subject: { kind: 'object', obj: `folder:${org.folderOf[d.id]}` } });
  for (const dept of org.depts) {
    for (let k = 1; k <= org.levels; k++) {
      t.push({ obj: folder(dept, k), rel: 'viewer', subject: { kind: 'set', obj: group(dept, k), rel: 'member' } });
      if (k + 1 <= org.levels) t.push({ obj: folder(dept, k), rel: 'editor', subject: { kind: 'set', obj: group(dept, k + 1), rel: 'member' } });
      if (k < org.levels) t.push({ obj: group(dept, k), rel: 'member', subject: { kind: 'set', obj: group(dept, k + 1), rel: 'member' } });
    }
  }
  for (const u of org.users) t.push({ obj: group(u.dept, u.clearance), rel: 'member', subject: { kind: 'user', id: u.id } });
  if (org.cycle) t.push({ obj: group(org.depts[0], org.levels), rel: 'member', subject: { kind: 'set', obj: group(org.depts[0], 1), rel: 'member' } });
  if (org.share) t.push({ obj: docObj(SHARE.doc), rel: 'viewer', subject: { kind: 'user', id: SHARE.user } });
  return t;
}

export interface Hop {
  from: string;
  to: string;
  label: string;
}

export interface CheckResult {
  granted: boolean;
  /** The chain that granted, from the question to the user, when it did. */
  path: Hop[];
  /** Every hop the search followed, granted or not. */
  explored: Hop[];
  /** How many (object, relation) pairs were expanded. */
  steps: number;
  /** A group that was reached a second time and skipped. */
  cycleIgnored: boolean;
  /** The search ran past the step budget (only the broken checker can). */
  exceeded: boolean;
}

export interface CheckOptions {
  /** Skip a set that is already being expanded. Off is the broken checker the lesson shows loops. */
  visited?: boolean;
  budget?: number;
}

/** Default step budget: far above any honest check in a lesson-sized organisation. */
export const STEP_BUDGET = 500;

const parentOf = (tuples: readonly Tuple[], obj: string): string[] =>
  tuples.filter((t) => t.obj === obj && t.rel === 'parent' && t.subject.kind === 'object').map((t) => (t.subject as { obj: string }).obj);

/** Can `userId` hold `rel` on `obj`? A depth-first walk of the tuples and the rewrite rules, recording the chain. */
export function check(tuples: readonly Tuple[], userId: string, obj: string, rel: string, o: CheckOptions = {}): CheckResult {
  const useVisited = o.visited ?? true;
  const budget = o.budget ?? STEP_BUDGET;
  const seen = new Set<string>();
  const explored: Hop[] = [];
  let steps = 0;
  let cycleIgnored = false;
  let exceeded = false;

  const walk = (obj0: string, rel0: string): Hop[] | null => {
    if (exceeded) return null;
    const key = setName(obj0, rel0);
    if (useVisited) {
      if (seen.has(key)) {
        cycleIgnored = true;
        return null;
      }
      seen.add(key);
    }
    steps += 1;
    if (steps > budget) {
      exceeded = true;
      return null;
    }
    const hop = (to: string, label: string): Hop => ({ from: key, to, label });
    for (const t of tuples) {
      if (t.obj !== obj0 || t.rel !== rel0) continue;
      if (t.subject.kind === 'user') {
        const h = hop(`user:${t.subject.id}`, rel0);
        explored.push(h);
        if (t.subject.id === userId) return [h];
      } else if (t.subject.kind === 'set') {
        const h = hop(setName(t.subject.obj, t.subject.rel), rel0);
        explored.push(h);
        const rest = walk(t.subject.obj, t.subject.rel);
        if (rest) return [h, ...rest];
      }
    }
    for (const r of REWRITES) {
      if (r.rel !== rel0) continue;
      if (r.from.kind === 'same') {
        const h = hop(setName(obj0, r.from.rel), r.text);
        explored.push(h);
        const rest = walk(obj0, r.from.rel);
        if (rest) return [h, ...rest];
      } else {
        for (const p of parentOf(tuples, obj0)) {
          const h = hop(setName(p, r.from.rel), `parent: ${r.text}`);
          explored.push(h);
          const rest = walk(p, r.from.rel);
          if (rest) return [h, ...rest];
        }
      }
    }
    return null;
  };

  const path = walk(obj, rel);
  return { granted: path !== null, path: path ?? [], explored, steps, cycleIgnored, exceeded };
}

/** The question a lesson asks for an action: read is viewer, edit is editor. */
export const relOf = (a: Action) => (a === 'read' ? 'viewer' : 'editor');
