import type { Kind, Level } from './model';

/**
 * The "bad diagram" scene: a diagram as plain data, five fixes that transform it, and a
 * readability checklist computed from the resulting data, never from which boxes are ticked.
 */

export interface DElement {
  id: string;
  name: string;
  /** What kind of thing it is; null when the diagram doesn't say. */
  kind: Kind | null;
  level: Level;
  tech: string | null;
  /** The element this one sits inside, when it isn't a top-level box. */
  parent: string | null;
}

export interface DEdge {
  from: string;
  to: string;
  intent: string | null;
  protocol: string | null;
}

export interface Diagram {
  title: string | null;
  /** The level this diagram claims to be at: nothing deeper belongs in it. */
  level: Level;
  elements: DElement[];
  edges: DEdge[];
  legend: boolean;
}

export type FixId = 'title' | 'labels' | 'oneLevel' | 'tech' | 'legend';
export const FIX_IDS: readonly FixId[] = ['labels', 'oneLevel', 'legend', 'title', 'tech'];

export const FIX_LABELS: Record<FixId, string> = {
  labels: 'Label every arrow with intent and protocol',
  oneLevel: 'Keep one level per diagram',
  legend: 'Add a key',
  title: 'Add a title and level',
  tech: 'Name the type and technology of each box',
};

const box = (id: string, name: string, level: Level, parent: string | null = null): DElement => ({ id, name, kind: null, level, tech: null, parent });

/** The diagram as found: vague labels, a database table drawn next to a whole payment system, no key. */
export const BAD: Diagram = {
  title: null,
  level: 2,
  legend: false,
  elements: [
    box('diner', 'Diner', 1),
    box('web', 'Web', 2),
    box('api', 'API', 2),
    box('resTable', 'reservations table', 3, 'db'),
    box('payments', 'Payment provider', 1),
  ],
  edges: [
    { from: 'diner', to: 'web', intent: 'uses', protocol: null },
    { from: 'web', to: 'api', intent: null, protocol: null },
    { from: 'api', to: 'resTable', intent: null, protocol: null },
    { from: 'api', to: 'payments', intent: null, protocol: null },
  ],
};

/** What a fix adds: the missing container a deeper box folds into, and the facts the labels carry. */
const FOLD_TARGETS: Record<string, DElement> = { db: box('db', 'Database', 2) };
const KINDS: Record<string, Kind> = { diner: 'person', web: 'container', api: 'container', db: 'container', resTable: 'component', payments: 'external' };
const TECH: Record<string, string> = { web: 'React single-page app', api: 'Node.js, REST', db: 'PostgreSQL' };
const LABELS: Record<string, { intent: string; protocol: string }> = {
  'diner>web': { intent: 'Books a table', protocol: 'HTTPS' },
  'web>api': { intent: 'Makes API calls', protocol: 'JSON/HTTPS' },
  'api>resTable': { intent: 'Reads and writes', protocol: 'SQL/TCP' },
  'api>db': { intent: 'Reads and writes', protocol: 'SQL/TCP' },
  'api>payments': { intent: 'Takes deposits', protocol: 'HTTPS' },
};
const TITLE = 'Containers: Book a table';

const edgeKey = (e: Pick<DEdge, 'from' | 'to'>) => `${e.from}>${e.to}`;

/** Replace every box deeper than the diagram's level by the box it lives in; arrows follow, and arrows that collapse are dropped. */
function foldDeeper(d: Diagram): Diagram {
  const home = (e: DElement): DElement => (e.level > d.level && e.parent ? FOLD_TARGETS[e.parent] : e);
  const folded = new Map<string, DElement>();
  for (const e of d.elements) folded.set(home(e).id, home(e));
  const mapId = (id: string) => home(d.elements.find((e) => e.id === id)!).id;
  const edges = new Map<string, DEdge>();
  for (const e of d.edges) {
    const next = { ...e, from: mapId(e.from), to: mapId(e.to) };
    if (next.from !== next.to) edges.set(edgeKey(next), next);
  }
  return { ...d, elements: [...folded.values()], edges: [...edges.values()] };
}

/** The diagram after the chosen fixes, in any order: they act on different properties. */
export function applyFixes(fixes: ReadonlySet<FixId>, base: Diagram = BAD): Diagram {
  let d = base;
  if (fixes.has('oneLevel')) d = foldDeeper(d);
  if (fixes.has('title')) d = { ...d, title: TITLE };
  if (fixes.has('legend')) d = { ...d, legend: true };
  if (fixes.has('tech')) d = { ...d, elements: d.elements.map((e) => ({ ...e, kind: KINDS[e.id] ?? e.kind, tech: TECH[e.id] ?? e.tech })) };
  if (fixes.has('labels')) d = { ...d, edges: d.edges.map((e) => ({ ...e, ...LABELS[edgeKey(e)] })) };
  return d;
}

export interface CheckItem {
  id: FixId;
  ok: boolean;
  /** What was counted, e.g. "2 of 4 arrows". */
  detail: string;
}

const filled = (s: string | null) => !!s && s.trim().length > 0;

/** The readability checklist, computed from the diagram's own properties. */
export function checklist(d: Diagram): CheckItem[] {
  const labelled = d.edges.filter((e) => filled(e.intent) && filled(e.protocol)).length;
  const deeper = d.elements.filter((e) => e.level > d.level).length;
  const typed = d.elements.filter((e) => e.kind !== null && (e.kind !== 'container' || filled(e.tech))).length;
  return [
    { id: 'labels', ok: labelled === d.edges.length, detail: `${labelled} of ${d.edges.length} arrows have an intent and a protocol` },
    { id: 'oneLevel', ok: deeper === 0, detail: deeper ? `${deeper} box${deeper === 1 ? ' is' : 'es are'} deeper than the level-${d.level} diagram` : `nothing deeper than level ${d.level}` },
    { id: 'legend', ok: d.legend, detail: d.legend ? 'a key explains the shapes and colours' : 'no key' },
    { id: 'title', ok: filled(d.title), detail: filled(d.title) ? `titled "${d.title}"` : 'no title, no level' },
    { id: 'tech', ok: typed === d.elements.length, detail: `${typed} of ${d.elements.length} boxes say what they are, and containers say what they are built with` },
  ];
}

export const score = (d: Diagram) => checklist(d).filter((c) => c.ok).length;

/** The kinds the key has to explain: those present in the diagram. */
export const kindsIn = (d: Diagram): Kind[] => [...new Set(d.elements.flatMap((e) => (e.kind ? [e.kind] : [])))];
