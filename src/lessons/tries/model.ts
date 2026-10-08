/**
 * A trie (prefix tree) of lowercase words, with step-recorded insert, prefix search and delete,
 * a radix-tree compression of it, and the costs the lesson compares.
 */

export interface TrieNode {
  children: Map<string, TrieNode>;
  end: boolean;
}

const node = (): TrieNode => ({ children: new Map(), end: false });

export function buildTrie(words: readonly string[]): TrieNode {
  const root = node();
  for (const w of words) insert(root, w);
  return root;
}

/** Insert a word; returns how many nodes were created. */
export function insert(root: TrieNode, word: string): number {
  let cur = root;
  let created = 0;
  for (const ch of word) {
    let next = cur.children.get(ch);
    if (!next) {
      next = node();
      cur.children.set(ch, next);
      created++;
    }
    cur = next;
  }
  cur.end = true;
  return created;
}

/** The node a prefix leads to, or null where the path breaks. */
export function find(root: TrieNode, prefix: string): TrieNode | null {
  let cur: TrieNode | undefined = root;
  for (const ch of prefix) {
    cur = cur.children.get(ch);
    if (!cur) return null;
  }
  return cur;
}

const sortedKids = (n: TrieNode) => [...n.children.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** Words under a prefix, read out by a depth-first walk with children in letter order: sorted. */
export function completions(root: TrieNode, prefix: string): string[] {
  const start = find(root, prefix);
  const out: string[] = [];
  const walk = (n: TrieNode, s: string) => {
    if (n.end) out.push(s);
    for (const [ch, kid] of sortedKids(n)) walk(kid, s + ch);
  };
  if (start) walk(start, prefix);
  return out;
}

export function countNodes(n: TrieNode): number {
  let c = 1;
  for (const kid of n.children.values()) c += countNodes(kid);
  return c;
}

/**
 * Delete a word: clear its end mark, then remove nodes bottom-up while they lead nowhere (no
 * children, no end mark). Returns the pruned prefixes, deepest first, or null if absent.
 */
export function remove(root: TrieNode, word: string): string[] | null {
  const chars = [...word];
  const path: TrieNode[] = [root];
  for (const ch of chars) {
    const next = path[path.length - 1].children.get(ch);
    if (!next) return null;
    path.push(next);
  }
  const last = path[path.length - 1];
  if (!last.end) return null;
  last.end = false;
  const pruned: string[] = [];
  for (let d = chars.length; d > 0; d--) {
    const n = path[d];
    if (n.end || n.children.size) break;
    path[d - 1].children.delete(chars[d - 1]);
    pruned.push(chars.slice(0, d).join(''));
  }
  return pruned;
}

// ── A drawable snapshot: nodes keyed by their prefix ──────────────────

export const ROOT_ID = '';

export interface ShapeNode {
  id: string;
  /** The edge label into this node: one letter in a trie, a run of letters in a radix tree. */
  label: string;
  end: boolean;
  children: string[];
}

export type Shape = Map<string, ShapeNode>;

export function trieShape(root: TrieNode): Shape {
  const shape: Shape = new Map();
  const walk = (n: TrieNode, id: string, label: string) => {
    const kids = sortedKids(n);
    shape.set(id, { id, label, end: n.end, children: kids.map(([ch]) => id + ch) });
    for (const [ch, kid] of kids) walk(kid, id + ch, ch);
  };
  walk(root, ROOT_ID, '');
  return shape;
}

/**
 * Radix tree: every non-root node with one child and no end mark is merged into its child, so a
 * chain like t-i-n-u-e under "con" becomes one edge "tinue". Node ids stay the full prefix.
 */
export function radixShape(root: TrieNode): Shape {
  const shape: Shape = new Map();
  const walk = (n: TrieNode, id: string, label: string) => {
    const kids: string[] = [];
    for (const [ch, first] of sortedKids(n)) {
      let kid = first;
      let edge = ch;
      while (!kid.end && kid.children.size === 1) {
        const [[c2, next]] = [...kid.children.entries()];
        edge += c2;
        kid = next;
      }
      kids.push(id + edge);
      walk(kid, id + edge, edge);
    }
    shape.set(id, { id, label, end: n.end, children: kids });
  };
  walk(root, ROOT_ID, '');
  return shape;
}

/** Ids under (and including) a node. */
export function subtree(shape: Shape, id: string): string[] {
  const n = shape.get(id);
  return n ? [id, ...n.children.flatMap((c) => subtree(shape, c))] : [];
}

export function depthOf(shape: Shape, id = ROOT_ID): number {
  const n = shape.get(id);
  return n && n.children.length ? 1 + Math.max(...n.children.map((c) => depthOf(shape, c))) : 0;
}

// ── Costs ─────────────────────────────────────────────────────────────

/** Edges a prefix lookup follows before it reaches the prefix node or falls off: at most |p|. */
export function trieSteps(root: TrieNode, prefix: string): number {
  let cur = root;
  let steps = 0;
  for (const ch of prefix) {
    const next = cur.children.get(ch);
    if (!next) break;
    steps++;
    cur = next;
  }
  return steps;
}

/** Child lookups a prefix lookup makes: one per edge followed, plus the one that fails if the path breaks. */
export function trieLookups(root: TrieNode, prefix: string): number {
  const followed = trieSteps(root, prefix);
  return followed < [...prefix].length ? followed + 1 : followed;
}

/**
 * The radix node that holds trie position `prefix`: the node itself, or the node whose merged
 * edge passes through it. Null when no word has that prefix.
 */
export function radixNodeFor(shape: Shape, prefix: string): string | null {
  let id = ROOT_ID;
  for (;;) {
    if (id === prefix) return id;
    const next = shape.get(id)?.children.find((c) => c.startsWith(prefix) || prefix.startsWith(c));
    if (next === undefined) return null;
    if (next.startsWith(prefix)) return next;
    id = next;
  }
}

/** Scanning the list with startsWith: one call per word, and the characters each call compares. */
export function scanCost(words: readonly string[], prefix: string): { calls: number; chars: number } {
  let chars = 0;
  for (const w of words) {
    for (let k = 0; k < prefix.length; k++) {
      chars++;
      if (w[k] !== prefix[k]) break;
    }
  }
  return { calls: words.length, chars };
}

/** Illustrative layout for the memory note: one child slot per letter in every node. */
export const SLOTS_PER_NODE = 26;

export const totalChars = (words: readonly string[]) => words.reduce((s, w) => s + w.length, 0);

// ── Input ─────────────────────────────────────────────────────────────

export const MAX_WORDS = 16;
export const MAX_WORD_LEN = 13;

export type ListResult = { ok: true; words: string[]; note: string | null } | { ok: false; error: string };
export type WordResult = { ok: true; word: string } | { ok: false; error: string };

export function parseWord(raw: string): WordResult {
  const w = raw.trim();
  if (w === '') return { ok: false, error: 'Type a word first.' };
  if (!/^[a-z]+$/.test(w)) return { ok: false, error: `“${w}” isn't a plain word: lowercase letters a-z only.` };
  if (w.length > MAX_WORD_LEN) return { ok: false, error: `Up to ${MAX_WORD_LEN} letters per word.` };
  return { ok: true, word: w };
}

/** A list of words separated by commas, spaces or new lines. Duplicates are dropped with a note. */
export function parseList(raw: string): ListResult {
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Type at least one word: lowercase letters a-z, separated by commas or spaces.' };
  for (const t of tokens) {
    const r = parseWord(t);
    if (!r.ok) return { ok: false, error: r.error };
  }
  const words = [...new Set(tokens)];
  if (words.length > MAX_WORDS) return { ok: false, error: `Up to ${MAX_WORDS} words fit on screen; that's ${words.length}.` };
  const dupes = [...new Set(tokens.filter((t, i) => tokens.indexOf(t) !== i))];
  const note = dupes.length ? `Listed twice, kept once: ${dupes.map((d) => `“${d}”`).join(', ')}. A trie holds each word once.` : null;
  return { ok: true, words, note };
}

export const PRESETS = [
  { id: 'code', label: 'Keywords', words: ['case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum'] },
  { id: 'states', label: 'US states, M and N', words: ['maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada'] },
  { id: 'nest', label: 'Nested', words: ['a', 'an', 'and', 'ant', 'any', 'tea', 'ten', 'to'] },
] as const;
