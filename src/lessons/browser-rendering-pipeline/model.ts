/**
 * Pure logic for "How Browsers Render a Page": which pipeline stages a style change typically
 * re-runs, the two ways to write a read/write loop, frame-time statistics and the render tree.
 * Nothing here touches the DOM, so every claim is testable.
 */
import { percentile } from '../../core/sim';

// ── The pipeline ────────────────────────────────────────────────────────

export const STAGES = ['parse-html', 'parse-css', 'style', 'layout', 'paint', 'composite'] as const;
export type StageId = (typeof STAGES)[number];

export const STAGE_INFO: Record<StageId, { title: string; sub: string; what: string }> = {
  'parse-html': { title: 'Parse HTML', sub: 'DOM', what: 'turns the markup into the DOM tree' },
  'parse-css': { title: 'Parse CSS', sub: 'CSSOM', what: 'turns the stylesheets into rules (the CSSOM)' },
  style: { title: 'Style', sub: 'computed styles', what: 'works out every element’s final property values' },
  layout: { title: 'Layout', sub: 'geometry', what: 'works out each box’s size and position' },
  paint: { title: 'Paint', sub: 'draw pixels', what: 'records what to draw: text, colours, borders, shadows' },
  composite: { title: 'Composite', sub: 'stack layers', what: 'stacks the painted layers and puts them on screen' },
};

// ── Which stages a property re-runs (typical Chromium behaviour) ────────

export const PROPERTIES = ['width', 'top', 'color', 'background', 'box-shadow', 'transform', 'opacity'] as const;
export type Property = (typeof PROPERTIES)[number];

/** What a property change typically forces, in the style of csstriggers-type tables. */
export type Trigger = 'layout' | 'paint' | 'composite';

export interface PropertyInfo {
  trigger: Trigger;
  /** The two values the sandbox flips between. */
  from: string;
  to: string;
  /** Why it triggers what it does, in plain words. */
  why: string;
}

/**
 * "Typical Chromium behaviour": engines differ and DevTools' Performance panel is the authority.
 * `background` means `background-color`; `top` means `top` on a positioned element.
 */
export const PROPERTY_INFO: Record<Property, PropertyInfo> = {
  width: { trigger: 'layout', from: '120px', to: '220px', why: 'changes the box’s size, which can move its neighbours' },
  top: { trigger: 'layout', from: '0px', to: '28px', why: 'moves a positioned box, which layout has to place again' },
  color: { trigger: 'paint', from: 'text in one colour', to: 'text in another', why: 'moves no box, but the text has to be drawn again' },
  background: { trigger: 'paint', from: 'one fill', to: 'another fill', why: 'moves no box, but the background has to be drawn again' },
  'box-shadow': { trigger: 'paint', from: 'no shadow', to: 'a soft shadow', why: 'moves no box, but the shadow has to be drawn again' },
  transform: { trigger: 'composite', from: 'translateX(0)', to: 'translateX(60px) rotate(8deg)', why: 'moves already-painted pixels without touching the layout' },
  opacity: { trigger: 'composite', from: '1', to: '0.35', why: 'blends already-painted pixels without touching the layout' },
};

/**
 * The stages a one-off change to `property` typically re-runs. The parse stages never re-run for a
 * style change: they ran once when the page loaded. Style always re-runs (any change recomputes styles).
 * `transform` and `opacity` skip layout and paint only when the element sits on its own compositor
 * layer (`promoted`: `will-change`, or a running animation); otherwise a repaint is typically needed too.
 */
export function stagesRerun(property: Property, promoted: boolean): StageId[] {
  const { trigger } = PROPERTY_INFO[property];
  if (trigger === 'layout') return ['style', 'layout', 'paint', 'composite'];
  if (trigger === 'paint') return ['style', 'paint', 'composite'];
  return promoted ? ['style', 'composite'] : ['style', 'paint', 'composite'];
}

/** A path that skips both layout and paint: the cheap one. */
export const isCompositeOnly = (stages: readonly StageId[]) => !stages.includes('layout') && !stages.includes('paint');

// ── Layout thrashing ─────────────────────────────────────────────────────

export type ThrashMode = 'interleaved' | 'batched';
export interface ThrashOp {
  kind: 'read' | 'write';
  row: number;
}

/** What each way of writing the loop does to the rows, in order. */
export function thrashOps(mode: ThrashMode, rows: number): ThrashOp[] {
  const ops: ThrashOp[] = [];
  if (mode === 'interleaved') {
    for (let i = 0; i < rows; i++) ops.push({ kind: 'read', row: i }, { kind: 'write', row: i });
  } else {
    for (let i = 0; i < rows; i++) ops.push({ kind: 'read', row: i });
    for (let i = 0; i < rows; i++) ops.push({ kind: 'write', row: i });
  }
  return ops;
}

/** The two things the loop does to one row. */
export interface RowIo {
  /** Read a layout-dependent number (`offsetHeight`). */
  read: (row: number) => number;
  /** Write a style that changes the row's width. */
  write: (row: number, value: number) => void;
}

/** The loop, written two ways, exactly as the code panel shows it. Returns the sum of what it read. */
export function runThrash(mode: ThrashMode, rows: number, io: RowIo, value: number): number {
  let sum = 0;
  if (mode === 'interleaved') {
    for (let i = 0; i < rows; i++) {
      sum += io.read(i);
      io.write(i, value);
    }
  } else {
    const heights: number[] = [];
    for (let i = 0; i < rows; i++) heights.push(io.read(i));
    for (let i = 0; i < rows; i++) io.write(i, value);
    for (const h of heights) sum += h;
  }
  return sum;
}

/**
 * How many reads would force a synchronous layout: a read right after a write finds the layout
 * stale (dirty) and the browser must redo it before answering. A model of the rule, not a measurement.
 * `startDirty` is whether something already changed the page before the loop.
 */
export function forcedLayouts(ops: readonly ThrashOp[], startDirty = false): number {
  let dirty = startDirty;
  let forced = 0;
  for (const op of ops) {
    if (op.kind === 'write') dirty = true;
    else if (dirty) {
      forced++;
      dirty = false;
    }
  }
  return forced;
}

export const THRASH_ROWS = 200;
/** One warm-up pass is thrown away, then this many measured passes per mode. */
export const THRASH_RUNS = 5;

/** The code the panel shows. The tests check it has the same shape `runThrash` runs. */
export const THRASH_SOURCE: Record<ThrashMode, string[]> = {
  interleaved: [
    'for (const row of rows) {',
    '  sum += row.offsetHeight;',
    '  row.style.width = w + "%";',
    '}',
  ],
  batched: [
    'for (const row of rows) {',
    '  heights.push(row.offsetHeight);',
    '}',
    'for (const row of rows) {',
    '  row.style.width = w + "%";',
    '}',
  ],
};

/** Short tags drawn beside the code lines that matter: what each line does to the layout. */
export const THRASH_TAGS: Record<ThrashMode, Record<number, string>> = {
  interleaved: { 1: 'forces layout', 2: 'invalidates it' },
  batched: { 1: 'reads', 4: 'writes' },
};

/** The source line that forces layout (the read that follows a write). */
export const FORCED_LINE: Record<ThrashMode, number> = { interleaved: 1, batched: -1 };

/** Median of the measured runs, via the shared percentile. */
export function median(xs: readonly number[]): number {
  return percentile([...xs].sort((a, b) => a - b), 0.5);
}

// ── Frame times ─────────────────────────────────────────────────────────

/** A frame slower than this reads as a stutter. */
export const LONG_FRAME_MS = 50;

export interface FrameStats {
  last: number;
  worst: number;
  longFrames: number;
}

export function frameStats(deltas: readonly number[]): FrameStats {
  return {
    last: deltas.length ? deltas[deltas.length - 1] : 0,
    worst: deltas.reduce((a, b) => Math.max(a, b), 0),
    longFrames: deltas.filter((d) => d > LONG_FRAME_MS).length,
  };
}

// ── The render tree ─────────────────────────────────────────────────────

export interface DomNode {
  id: string;
  /** The element's tag, as drawn in the tree. */
  tag: string;
  children: string[];
}

export const DOM_ROOT = 'html';
const NODES: DomNode[] = [
  { id: 'html', tag: 'html', children: ['head', 'body'] },
  { id: 'head', tag: 'head', children: ['title'] },
  { id: 'title', tag: 'title', children: [] },
  { id: 'body', tag: 'body', children: ['header', 'nav', 'main', 'footer'] },
  { id: 'header', tag: 'h1', children: [] },
  { id: 'nav', tag: 'nav', children: [] },
  { id: 'main', tag: 'main', children: ['intro', 'note', 'list'] },
  { id: 'intro', tag: 'p.intro', children: [] },
  { id: 'note', tag: 'p.note', children: [] },
  { id: 'list', tag: 'ul', children: ['item1', 'item2'] },
  { id: 'item1', tag: 'li', children: [] },
  { id: 'item2', tag: 'li', children: [] },
  { id: 'footer', tag: 'footer', children: [] },
];
export const DOM: Record<string, DomNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** The elements the learner can restyle. */
export const RESTYLABLE = ['nav', 'note', 'list'] as const;
export type Restylable = (typeof RESTYLABLE)[number];

export type HideStyle = 'normal' | 'display-none' | 'visibility-hidden';
export type Styles = Partial<Record<string, HideStyle>>;

/** Elements the browser's own stylesheet gives `display: none`: they are in the DOM, never in the render tree. */
export const UA_HIDDEN = new Set(['head']);

export interface RenderTree {
  /** Nodes that get a box. */
  inTree: Set<string>;
  /** Boxes that are not drawn (`visibility: hidden`, set on them or inherited): they still take space. */
  unpainted: Set<string>;
}

/**
 * Builds the render tree from the DOM and the learner's styles: a `display: none` element (and
 * everything under it) gets no box at all; `visibility: hidden` keeps the box (and so its space)
 * but doesn't draw it, and children inherit it unless they override it (a child with
 * `visibility: visible` would show again; this model has no such override).
 */
export function buildRenderTree(styles: Styles): RenderTree {
  const inTree = new Set<string>();
  const unpainted = new Set<string>();
  const walk = (id: string, parentHidden: boolean) => {
    const style = styles[id] ?? 'normal';
    if (UA_HIDDEN.has(id) || style === 'display-none') return;
    inTree.add(id);
    const hidden = parentHidden || style === 'visibility-hidden';
    if (hidden) unpainted.add(id);
    for (const child of DOM[id].children) walk(child, hidden);
  };
  walk(DOM_ROOT, false);
  return { inTree, unpainted };
}

/** Every node id in the DOM, in document order. */
export function domOrder(root = DOM_ROOT): string[] {
  return [root, ...DOM[root].children.flatMap((c) => domOrder(c))];
}
