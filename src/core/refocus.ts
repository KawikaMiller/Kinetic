/** Where to put keyboard focus once a press has removed the control that had it. */
export interface RefocusOptions {
  /** Closest ancestor of the removed control that holds its siblings (default: its control group). */
  group?: string;
  /** The sibling controls inside `group` (default: its buttons). */
  items?: string;
  /** Where to go when no sibling is left, looked up from the stage controls: the first enabled button when omitted. */
  fallback?: string;
  /** Closest ancestor `fallback` is searched in (default: the lesson's control stack). */
  root?: string;
}

const DEFAULT_GROUP = '.control-group';
const DEFAULT_ROOT = '.controls-stack';

/**
 * A control that removes itself (a chip that drops its own item) unmounts with focus on it, and focus falls to the page.
 * Call this from its click handler with `e.currentTarget`: once the group has redrawn it focuses the control that now
 * stands in the removed one's place (the next sibling, or the last one), or the fallback when none is left.
 */
export function refocusAfterRemove(removed: Element | null, { group = DEFAULT_GROUP, items = 'button', fallback, root = DEFAULT_ROOT }: RefocusOptions = {}): void {
  const scope = removed?.closest(group) ?? null;
  const area = removed?.closest(root) ?? document;
  const position = scope ? [...scope.querySelectorAll(items)].indexOf(removed as Element) : -1;
  requestAnimationFrame(() => {
    const siblings = [...(scope?.querySelectorAll<HTMLElement>(items) ?? [])];
    const next = siblings[Math.min(Math.max(position, 0), siblings.length - 1)];
    (next ?? area.querySelector<HTMLElement>(fallback ?? 'button:not([disabled])'))?.focus();
  });
}
