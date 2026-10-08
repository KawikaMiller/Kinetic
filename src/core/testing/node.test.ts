import { describe, expect, it } from 'vitest';
import { nodePath, runNode, spawnSync } from './node';

describe('core/testing/node', () => {
  it('runs a script and returns stdout and the exit code', () => {
    const r = runNode(['console.log(1 + 1);', 'console.error("warned");']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('2');
    expect(r.stderr.trim()).toBe('warned');
  });

  it('reports a failing exit code', () => {
    expect(runNode('process.exit(3)').status).toBe(3);
  });

  it('passes stdin through', () => {
    const r = spawnSync(nodePath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'echo' });
    expect(r.stdout).toBe('echo');
  });
});
