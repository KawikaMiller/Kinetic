import { describe, expect, it } from 'vitest';
import { LESSON_HISTORY, register } from './avro';
import { DEFAULT_PARAMS, crossBoth, encode, V1, V1_MESSAGE, evolve } from './proto';
import { rollout, totalFailures } from './rollout';
import lesson from './index';

/** The default state of each scene, exactly as the Stage starts: protobuf Add a field, binary, strict JSON; Avro BACKWARD on the lesson history; rollout add tag no default, consumers first. */
describe('the try-this prompts work from the default state, as written', () => {
  it('has five prompts', () => {
    expect(lesson.tryThis).toHaveLength(5);
  });

  it('try-this 1: Add a field reads cleanly both ways, and the v2 writer\'s field 4 bytes are skipped by the v1 reader', () => {
    const { crossing, evolved } = crossBoth('add', DEFAULT_PARAMS, 'binary', true);
    expect(crossing!.oldToNew.verdict).toBe('ok');
    expect(crossing!.newToOld.verdict).toBe('ok');
    expect(crossing!.newToOld.unknown.map((u) => u.field)).toEqual([4]);
    const skipped = crossing!.newToOld.unknown[0];
    const grid = encode(evolved.schema!, evolved.message).bytes;
    expect(skipped.to).toBeLessThan(grid.length);
    expect(grid.slice(skipped.from, skipped.to + 1)).toEqual([0x22, 0x03, 0x61, 0x64, 0x61]);
  });

  it('try-this 2: Reuse 3 (same type) reads the old qty of 300 as discount, with no error and nothing unknown', () => {
    const r = crossBoth('reuse-same', DEFAULT_PARAMS, 'binary', true).crossing!.oldToNew;
    expect(r.verdict).toBe('lossy');
    expect(r.shown).toContain('discount: 300');
    expect(r.unknown).toEqual([]);
    expect(r.findings.some((f) => f.kind === 'error')).toBe(false);
  });

  it('try-this 3: Rename name leaves the bytes alone, and JSON fails in both directions', () => {
    const renamed = evolve('rename', DEFAULT_PARAMS);
    expect(encode(renamed.schema!, renamed.message).bytes).toEqual(encode(V1, V1_MESSAGE).bytes);
    const binary = crossBoth('rename', DEFAULT_PARAMS, 'binary', true).crossing!;
    expect([binary.oldToNew.verdict, binary.newToOld.verdict]).toEqual(['ok', 'ok']);
    const json = crossBoth('rename', DEFAULT_PARAMS, 'json', true).crossing!;
    expect([json.oldToNew.verdict, json.newToOld.verdict]).toEqual(['error', 'error']);
  });

  it('try-this 4: BACKWARD accepts v3, and BACKWARD_TRANSITIVE refuses it because v1 data has no b', () => {
    expect(register('BACKWARD', LESSON_HISTORY, 2).accepted).toBe(true);
    const transitive = register('BACKWARD_TRANSITIVE', LESSON_HISTORY, 2);
    expect(transitive.accepted).toBe(false);
    expect(transitive.checks.find((c) => c.problems.length)).toMatchObject({ reader: 2, writer: 0, problems: ['b has no default and the writer lacks it'] });
  });

  it('try-this 5: add tag with no default, consumers first, fails messages; producers first drops the count to 0', () => {
    expect(totalFailures(rollout('add-required', 'consumers-first'))).toBeGreaterThan(0);
    expect(totalFailures(rollout('add-required', 'producers-first'))).toBe(0);
  });
});
