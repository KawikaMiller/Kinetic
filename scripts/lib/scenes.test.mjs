import { describe, expect, it } from 'vitest';
import { isRenderLoop, sceneProblems, shardIds } from './scenes.mjs';

describe('the scene scan reads a render loop out of the console', () => {
  it('recognises React update-depth and re-render messages, and nothing else', () => {
    expect(isRenderLoop('Maximum update depth exceeded. This can happen when a component calls setState inside useEffect')).toBe(true);
    expect(isRenderLoop('pageerror: Too many re-renders. React limits the number of renders')).toBe(true);
    expect(isRenderLoop('Failed to load resource: 404')).toBe(false);
  });

  it('a quiet scene has no problems; a looping one fails and says so first', () => {
    expect(sceneProblems([])).toEqual([]);
    const problems = sceneProblems(['Warning: key', 'Maximum update depth exceeded', 'Maximum update depth exceeded']);
    expect(problems[0]).toMatch(/RENDER LOOP/);
    expect(problems).toHaveLength(2);
    expect(problems[1]).toBe('console: Warning: key');
  });

  it('any console error fails the scene, loop or not', () => {
    expect(sceneProblems(['pageerror: boom'])).toEqual(['console: pageerror: boom']);
  });
});

describe('shardIds', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('splits into shards that together cover every id exactly once', () => {
    const parts = [1, 2, 3].map((i) => shardIds(ids, `${i}/3`));
    expect(parts).toEqual([['a', 'd'], ['b', 'e'], ['c']]);
    expect(parts.flat().sort()).toEqual(ids);
  });
  it('keeps everything without a shard and refuses a malformed one', () => {
    expect(shardIds(ids, undefined)).toEqual(ids);
    expect(() => shardIds(ids, '0/3')).toThrow();
    expect(() => shardIds(ids, '4/3')).toThrow();
    expect(() => shardIds(ids, 'x')).toThrow();
  });
});
