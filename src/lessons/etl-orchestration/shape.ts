/**
 * etl-orchestration, scene 4: the same pipeline as ETL (transform on the pipeline's workers, load only the result) and as ELT (load
 * raw tables first, transform with queries in the warehouse). Changing the cleaning rule means re-running the cleaning step and
 * everything after it; ETL also has to re-run whatever it needs as input, because it kept nothing between steps.
 */

export type Style = 'etl' | 'elt';
export interface Step {
  id: string;
  /** Reads the source system. */
  extract: boolean;
  /** Where it runs. */
  where: 'workers' | 'warehouse';
  after: string[];
}

export const PIPELINES: Record<Style, Step[]> = {
  etl: [
    { id: 'extract_orders', extract: true, where: 'workers', after: [] },
    { id: 'extract_users', extract: true, where: 'workers', after: [] },
    { id: 'clean', extract: false, where: 'workers', after: ['extract_orders'] },
    { id: 'join', extract: false, where: 'workers', after: ['clean', 'extract_users'] },
    { id: 'load_report', extract: false, where: 'workers', after: ['join'] },
  ],
  elt: [
    { id: 'extract_load_orders', extract: true, where: 'workers', after: [] },
    { id: 'extract_load_users', extract: true, where: 'workers', after: [] },
    { id: 'clean', extract: false, where: 'warehouse', after: ['extract_load_orders'] },
    { id: 'join', extract: false, where: 'warehouse', after: ['clean', 'extract_load_users'] },
    { id: 'build_report', extract: false, where: 'warehouse', after: ['join'] },
  ],
};

const descendants = (steps: readonly Step[], id: string): string[] => steps.filter((s) => s.after.includes(id)).flatMap((s) => [s.id, ...descendants(steps, s.id)]);
const ancestors = (steps: readonly Step[], id: string): string[] => (steps.find((s) => s.id === id)?.after ?? []).flatMap((a) => [a, ...ancestors(steps, a)]);

/** The steps that run again after the cleaning rule changes. */
export function rerunAfterRuleChange(style: Style): { steps: string[]; extractRuns: number } {
  const steps = PIPELINES[style];
  const need = new Set(['clean', ...descendants(steps, 'clean')]);
  // ETL kept nothing between steps, so every input of a re-run step is made again; ELT's inputs sit in the warehouse.
  if (style === 'etl') for (const id of [...need]) for (const a of ancestors(steps, id)) need.add(a);
  const ordered = steps.filter((s) => need.has(s.id));
  return { steps: ordered.map((s) => s.id), extractRuns: ordered.filter((s) => s.extract).length };
}

/** Steps a normal daily run executes, and how many read the source. */
export const dailyRun = (style: Style): { steps: number; extractRuns: number } => ({ steps: PIPELINES[style].length, extractRuns: PIPELINES[style].filter((s) => s.extract).length });
