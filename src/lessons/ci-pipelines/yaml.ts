import type { PipelineOptions } from './pipeline';

export interface PipelineYaml {
  lines: string[];
  /** Line index of each job's block, by job id (every unit shard maps to the matrix job). */
  jobLine: (id: string) => number;
}

/**
 * The workflow file for these options: GitHub Actions style, condensed to one flow-style
 * line per job (runs-on, checkout and artifact steps omitted).
 */
export function pipelineYaml(o: Pick<PipelineOptions, 'cache' | 'shards'>): PipelineYaml {
  const lines: string[] = ['on: push', 'jobs:'];
  const at = new Map<string, number>();
  const job = (id: string, ...body: string[]) => {
    at.set(id, lines.length);
    lines.push(...body.map((b, i) => (i === 0 ? `  ${`${id}:`.padEnd(13)}${b}` : `${' '.repeat(15)}${b}`)));
  };
  job('install', o.cache ? '{ steps: [restore cache, npm ci] }' : '{ steps: [npm ci] }');
  job('lint', '{ needs: install, run: npm run lint }');
  job('typecheck', '{ needs: install, run: npx tsc --noEmit }');
  job('build', '{ needs: install, run: npm run build }');
  if (o.shards > 1) {
    const list = Array.from({ length: o.shards }, (_, i) => i + 1).join(', ');
    job('unit', `{ needs: build, strategy: { matrix: { shard: [${list}] } },`, `  run: npm test -- --shard=\${{ matrix.shard }}/${o.shards} }`);
  } else job('unit', '{ needs: build, run: npm test }');
  job('integration', '{ needs: build, run: npm run test:integration }');
  job('e2e', '{ needs: [unit, integration], run: npm run test:e2e }');
  job('package', '{ needs: [e2e, lint, typecheck], run: npm pack }');
  job('deploy', "{ needs: package, if: github.ref == 'refs/heads/main' }");
  return { lines, jobLine: (id) => at.get(id.startsWith('unit-') ? 'unit' : id) ?? -1 };
}
