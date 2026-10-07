// A simplified accessibility model of the sign-up form (WCAG contrast maths is core/contrast).
// This is NOT the browser's accessibility tree: it applies the main rules (roles from
// elements, the accessible-name order, tab order) to the form's current state, so the
// learner can see why each fix matters. The screen shows that disclaimer.

export type FixId = 'button' | 'alt' | 'label' | 'heading' | 'order' | 'live';

export const FIXES: { id: FixId; label: string; broken: string; fixed: string }[] = [
  { id: 'button', label: 'Sign-up button', broken: '<div onclick>', fixed: '<button>' },
  { id: 'alt', label: 'Logo image', broken: 'no alt', fixed: 'alt="Brew & Co"' },
  { id: 'label', label: 'Email field', broken: 'text next to it', fixed: '<label for>' },
  { id: 'heading', label: 'Title', broken: 'styled <div>', fixed: '<h2>' },
  { id: 'order', label: 'Focus order', broken: 'tabindex="1"', fixed: 'natural order' },
  { id: 'live', label: 'Error message', broken: 'plain <p>', fixed: 'role="alert"' },
];

export type Fixes = Record<FixId, boolean>;
export const NONE_FIXED: Fixes = { button: false, alt: false, label: false, heading: false, order: false, live: false };
export const ALL_FIXED: Fixes = { button: true, alt: true, label: true, heading: true, order: true, live: true };

export type NodeId = 'form' | 'logo' | 'title' | 'email' | 'news' | 'submit' | 'error' | 'done';

/** The confirmation the form shows after a successful sign-up. */
export const SIGNED_UP = 'Thanks, you are signed up.';

export interface AxNode {
  id: NodeId;
  role: string;
  name: string;
  /** Extra state a screen reader announces ("not checked", "level 2"). */
  state?: string;
  focusable: boolean;
  /** The tabindex attribute, or null when the element has none. */
  tabindex: number | null;
  /** What's wrong, if anything. */
  issue?: string;
  /** Which fix affects this node, for colouring fixed nodes. */
  fix?: FixId;
}

export interface NameSources {
  ariaLabel?: string;
  /** Text of an associated <label>. Text that's merely next to the field doesn't count. */
  label?: string;
  alt?: string;
  /** For roles that take their name from their content (buttons, headings, links). */
  content?: string;
  placeholder?: string;
}

/**
 * The accessible-name order, simplified from the Accessible Name and HTML-AAM specs:
 * aria-label, then an associated label (or alt for images), then content for roles that
 * allow it, then placeholder as a last resort.
 */
export function accessibleName(s: NameSources): string {
  return (s.ariaLabel ?? s.label ?? s.alt ?? s.content ?? s.placeholder ?? '').trim();
}

/** What the page shows below the button, and the checkbox's live state. */
export interface FormState {
  errorShown: boolean;
  signedUp?: boolean;
  newsletter?: boolean;
}

/** The form as the model sees it, in DOM order, for the current fixes. */
export function buildTree(f: Fixes, { errorShown, signedUp = false, newsletter = false }: FormState): AxNode[] {
  const nodes: AxNode[] = [
    { id: 'form', role: 'form', name: accessibleName({ ariaLabel: 'Sign up' }), focusable: false, tabindex: null },
    f.alt
      ? { id: 'logo', role: 'img', name: accessibleName({ alt: 'Brew & Co' }), focusable: false, tabindex: null, fix: 'alt' }
      : { id: 'logo', role: 'img', name: '', focusable: false, tabindex: null, issue: 'image with no alt: readers say "unlabelled image" or the file name', fix: 'alt' },
    f.heading
      ? { id: 'title', role: 'heading', name: accessibleName({ content: 'Create your account' }), state: 'level 2', focusable: false, tabindex: null, fix: 'heading' }
      : { id: 'title', role: 'text', name: 'Create your account', focusable: false, tabindex: null, issue: 'looks like a heading but isn\'t one, so heading navigation skips it', fix: 'heading' },
    f.label
      ? { id: 'email', role: 'textbox', name: accessibleName({ label: 'Email' }), focusable: true, tabindex: null, fix: 'label' }
      : { id: 'email', role: 'textbox', name: '', focusable: true, tabindex: null, issue: 'no label: the word "Email" beside it isn\'t connected', fix: 'label' },
    {
      id: 'news',
      role: 'checkbox',
      name: accessibleName({ label: 'Send me the newsletter' }),
      state: newsletter ? 'checked' : 'not checked',
      focusable: true,
      tabindex: f.order ? null : 1,
      issue: f.order ? undefined : 'tabindex="1" makes it the first stop on the whole page',
      fix: 'order',
    },
    f.button
      ? { id: 'submit', role: 'button', name: accessibleName({ content: 'Sign up' }), focusable: true, tabindex: null, fix: 'button' }
      : { id: 'submit', role: 'generic', name: '', focusable: false, tabindex: null, issue: 'a clickable <div>: no button role, can\'t be focused or pressed with a keyboard', fix: 'button' },
  ];
  if (errorShown) {
    nodes.push(
      f.live
        ? { id: 'error', role: 'alert', name: 'Please enter your email address.', focusable: false, tabindex: null, fix: 'live' }
        : { id: 'error', role: 'text', name: 'Please enter your email address.', focusable: false, tabindex: null, issue: 'appears silently: nothing tells a screen reader it showed up', fix: 'live' },
    );
  }
  if (signedUp) {
    nodes.push(
      f.live
        ? { id: 'done', role: 'status', name: SIGNED_UP, focusable: false, tabindex: null, fix: 'live' }
        : { id: 'done', role: 'text', name: SIGNED_UP, focusable: false, tabindex: null, issue: 'appears silently: nothing tells a screen reader it showed up', fix: 'live' },
    );
  }
  return nodes;
}

/**
 * Sequential focus order: elements with a positive tabindex first (ascending, ties in
 * DOM order), then everything focusable with tabindex 0 or none, in DOM order.
 * tabindex -1 and unfocusable elements are never Tab stops.
 */
export function tabOrder<T extends { focusable: boolean; tabindex: number | null }>(nodes: T[]): T[] {
  const stops = nodes.filter((n) => n.focusable && (n.tabindex === null || n.tabindex >= 0));
  const positive = stops.filter((n) => (n.tabindex ?? 0) > 0).sort((a, b) => a.tabindex! - b.tabindex!);
  const natural = stops.filter((n) => (n.tabindex ?? 0) === 0);
  return [...positive, ...natural];
}

/** What a screen reader says when it lands on a node. */
export function announce(n: AxNode): string {
  switch (n.role) {
    case 'button':
      return `${n.name}, button`;
    case 'textbox':
      return n.name ? `${n.name}, edit text` : 'edit text (no label)';
    case 'checkbox':
      return `${n.name}, checkbox, ${n.state}`;
    case 'heading':
      return `${n.name}, heading ${n.state}`;
    case 'img':
      return n.name ? `${n.name}, image` : 'unlabelled image';
    case 'form':
      return `${n.name}, form`;
    case 'alert':
      return `Alert: ${n.name}`;
    default:
      return n.name || '(skipped: nothing to announce)';
  }
}

/**
 * Approximate colour-vision-deficiency simulations (feColorMatrix values, a common
 * simplification of the Machado/Viénot models). Enough to show "colour alone" failing.
 */
export const CVD_MATRICES = {
  protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
} as const;
export type Vision = 'normal' | keyof typeof CVD_MATRICES;
