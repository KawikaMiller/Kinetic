import { describe, expect, it } from 'vitest';
import { buildJobs } from './pipeline';
import { pipelineYaml } from './yaml';

describe('pipeline YAML', () => {
  it('has a block for every job, and every unit shard points at the matrix job', () => {
    const o = { cache: true, shards: 4 as const };
    const { lines, jobLine } = pipelineYaml(o);
    for (const job of buildJobs({ ...o, branch: 'main' })) {
      const line = jobLine(job.id);
      expect(line).toBeGreaterThan(0);
      expect(lines[line]).toContain(job.id.startsWith('unit-') ? 'unit:' : `${job.id}:`);
    }
    expect(lines.join('\n')).toContain('shard: [1, 2, 3, 4]');
  });

  it('mirrors the options: the cache step and sharding appear only when on', () => {
    const plain = pipelineYaml({ cache: false, shards: 1 }).lines.join('\n');
    expect(plain).not.toContain('cache');
    expect(plain).not.toContain('matrix');
    expect(pipelineYaml({ cache: true, shards: 1 }).lines.join('\n')).toContain('restore cache');
  });
});
