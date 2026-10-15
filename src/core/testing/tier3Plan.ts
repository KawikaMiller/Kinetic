/**
 * The Tier 3 final list (docs/tier3-plan.md §2) as rows, for tests that pin the code to the plan.
 * Test-only: never import this from app code. `tier3PlanRows` is empty when the plan file is not
 * in the tree, and tests that need it skip with `it.skipIf(!tier3PlanRows.length)`.
 */

export interface Tier3PlanRow {
  id: string;
  title: string;
  track: string;
  priority: string;
  /** Flagged **D**: needs a domain review (and a Provenance chip). */
  domainReview: boolean;
}

const raw = Object.values(
  import.meta.glob<string>('../../../docs/tier3-plan.md', { query: '?raw', import: 'default', eager: true }),
)[0];

function parseRows(markdown: string): Tier3PlanRow[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## 2.'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## 3.'));
  return lines
    .slice(start, end)
    .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
    .map((l) => {
      const [id, title, track, priority, domain] = l.split('|').slice(1, 6).map((c) => c.trim());
      return { id: id.replace(/`/g, ''), title, track, priority, domainReview: domain === '**D**' };
    });
}

export const tier3PlanRows: Tier3PlanRow[] = raw ? parseRows(raw) : [];
