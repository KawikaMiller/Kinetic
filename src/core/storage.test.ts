import { describe, expect, it } from 'vitest';
import { isBooleanRecord, isStringArray, parseStored } from './storage';

describe('parseStored', () => {
  it('returns the fallback when nothing is stored', () => {
    expect(parseStored(null, ['x'], isStringArray)).toEqual(['x']);
  });

  it('returns the fallback for invalid JSON', () => {
    expect(parseStored('{not json', [], isStringArray)).toEqual([]);
  });

  it('returns the fallback for valid JSON of the wrong shape', () => {
    // The QA report's white-screen cases: null and {} where an array or record is expected.
    expect(parseStored('null', [], isStringArray)).toEqual([]);
    expect(parseStored('{}', [], isStringArray)).toEqual([]);
    expect(parseStored('[1, "a"]', [], isStringArray)).toEqual([]);
    expect(parseStored('null', {}, isBooleanRecord)).toEqual({});
    expect(parseStored('[]', {}, isBooleanRecord)).toEqual({});
    expect(parseStored('{"sorting": "yes"}', {}, isBooleanRecord)).toEqual({});
  });

  it('keeps a value of the right shape', () => {
    expect(parseStored('["sorting","raft"]', [], isStringArray)).toEqual(['sorting', 'raft']);
    expect(parseStored('{"sorting":true,"raft":false}', {}, isBooleanRecord)).toEqual({ sorting: true, raft: false });
  });
});
