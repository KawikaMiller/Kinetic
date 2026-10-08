import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { poolCaption } from './captions';
import { advance, createWorld, summarize, type Config } from './model';
import { scenarioConfig } from './scenarios';

const captionAfter = (cfg: Config, seconds: number) => {
  const w = createWorld(cfg, 21);
  advance(w, cfg, seconds);
  return expectCaption(poolCaption(cfg, summarize(w, cfg)));
};

describe('the pool caption compares with Little\'s law only as far as it is true', () => {
  it('a 2 ms query is rounded up to one tick, and the caption says so instead of "close to"', () => {
    const cfg: Config = { ...scenarioConfig('nopool'), usePool: true, poolSize: 10 };
    const text = captionAfter(cfg, 30);
    expect(text).not.toContain('close to');
    expect(text).toContain('moves in 5 ms steps');
  });

  it('a settled run with a normal query says close to', () => {
    const cfg: Config = { rate: 100, instances: 1, poolSize: 20, dbMax: 100, queryMs: 20, usePool: true, leak: false };
    expect(captionAfter(cfg, 30)).toContain('close to the 2 that');
  });

  it('the over-subscribed caption calls the slowdown the model\'s, not the database\'s', () => {
    const text = captionAfter(scenarioConfig('toobig'), 6);
    expect(text).toContain('In this model queries run');
    expect(text).toContain('invented cost');
  });

  it('one flagged leak reads "1 connection", not "1 ones"', () => {
    const text = captionAfter({ ...scenarioConfig('leak'), rate: 100 }, 40);
    expect(text).not.toMatch(/\bones\b/);
  });
});
