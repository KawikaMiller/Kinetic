import { changedFiles, coreChanged, filesFor, importEdges, rankIn, violations, type Choices } from './model';

/** Captions as plain text, computed from the files the current choices deploy. */

const names = (paths: readonly string[]) => paths.map((p) => p.split('/').pop()).join(', ');

export function viewCaption(c: Choices): string {
  const v = violations(importEdges(filesFor(c)), (p) => rankIn(c.view, p));
  if (c.view === 'layered') {
    return 'Layered: controller → service → repository → database, every arrow pointing down. The business rule ("over $500 needs approval") lives in OrderService, which imports a concrete repository.';
  }
  if (v.length) {
    return `Domain imports storage: ${v.map((e) => `${names([e.from])} → ${names([e.to])}`).join(', ')} points outward, against the dependency rule.`;
  }
  return 'Hexagon: the domain sits in the middle and owns the ports (interfaces). Every adapter imports a port; nothing in the domain imports an adapter.';
}

export function swapCaption(before: Choices, after: Choices): string {
  const a = filesFor(before);
  const b = filesFor(after);
  const core = coreChanged(a, b);
  const all = changedFiles(a, b);
  const others = all.filter((p) => !core.includes(p));
  if (after.view === 'layered') {
    return core.length
      ? `${names(core)} had to change: it imports the repository class by name, so a database swap edits the file with the business rule. Also changed: ${names(others)}.`
      : `Changed: ${names(others)}. The service with the business rule stayed the same.`;
  }
  if (core.length) return `The domain itself had to change (${names(core)}), because it imports storage directly. Also changed: ${names(others)}.`;
  return `Changed: ${names(others)}. 0 domain files changed: only main.ts, the composition root, knows which adapters exist.`;
}
