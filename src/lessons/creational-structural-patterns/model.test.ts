import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { NO_ADAPTER_ERROR, adapterFrames, builderCaption, factoryCaption, stackFrames } from './frames';
import {
  ADAPTER_CODE, ALL_CHOICES, CALL_SITES, DECORATOR_PRESETS, FACTORY_FILE, LAYERS, TIME, appCode, buildFrom, legacyWeather, permutations, runStack, touchedFiles,
  xmlWeatherAdapter, type BuilderChoice, type LayerId,
} from './model';

describe('factory', () => {
  it('adding a provider touches 4 call sites without a factory and 1 file with it, computed from the code', () => {
    expect(touchedFiles(false)).toEqual(CALL_SITES);
    expect(touchedFiles(true)).toEqual([FACTORY_FILE]);
    expect(captionText(factoryCaption(false, true))).toContain('4 files');
    expect(captionText(factoryCaption(true, true))).toContain('1 file');
  });

  it('with a factory, no call site names a concrete class', () => {
    for (const f of appCode(['stripe', 'paypal'], true).filter((f) => f.name !== FACTORY_FILE)) expect(f.lines.join('\n')).not.toMatch(/new \w+Client/);
  });
});

describe('builder', () => {
  /** Independent statement of the rules the caption lists. */
  const expectedErrors = (c: BuilderChoice) =>
    [
      c.method === 'GET' && c.body && 'a GET request cannot have a body',
      c.method === 'POST' && !c.body && 'a POST request needs a body',
      c.retries > 5 && 'retries must be 0 to 5',
      c.timeoutMs <= 0 && 'the timeout must be above 0 ms',
    ].filter(Boolean);

  it('build() rejects exactly the invalid combinations, for all 16 choices', () => {
    expect(ALL_CHOICES).toHaveLength(16);
    for (const c of ALL_CHOICES) {
      const r = buildFrom(c);
      const want = expectedErrors(c);
      expect(r.ok ? [] : r.errors).toEqual(want);
      const say = captionText(builderCaption(c));
      if (want.length) for (const w of want) expect(say).toContain(w as string);
      else expect(say).toContain('accepts it');
    }
  });
});

describe('adapter', () => {
  it('converts the legacy XML to the shape the app expects: 68 °F is 20 °C', () => {
    expect(xmlWeatherAdapter(legacyWeather).current()).toEqual({ tempC: 20, sky: 'clear' });
  });

  it('the on-screen adapter code, run as real JavaScript, gives the same', () => {
    // Safe: fixed, lesson-authored program text.
    const weather = new Function('legacy', `${ADAPTER_CODE.join('\n')}\nreturn weather;`)(legacyWeather) as { current(): unknown };
    expect(weather.current()).toEqual({ tempC: 20, sky: 'clear' });
  });

  it('without the adapter, real JavaScript throws the error shown', () => {
    let msg = '';
    try {
      new Function('legacy', 'return legacy.current();')(legacyWeather);
    } catch (e) {
      msg = `${(e as Error).name}: ${(e as Error).message}`;
    }
    expect(msg).toBe(NO_ADAPTER_ERROR);
    expect(captionText(adapterFrames(false).at(-1)!.say)).toContain(NO_ADAPTER_ERROR);
    expect(captionText(adapterFrames(true).at(-1)!.say)).toContain('tempC: 20');
  });
});

describe('decorator stack', () => {
  const inside = (order: LayerId[], a: LayerId, b: LayerId) => order.indexOf(a) > order.indexOf(b);
  /** How often a layer is passed through in call 1 (the core fails once) and call 2 (a cache hit). */
  const passes = (order: LayerId[], l: LayerId) => {
    const first = l !== 'retry' && inside(order, l, 'retry') ? 2 : 1;
    const second = l !== 'caching' && inside(order, l, 'caching') ? 0 : 1;
    return first + second;
  };
  const all = permutations(LAYERS);

  it('covers all 24 orderings', () => {
    expect(all).toHaveLength(24);
    expect(new Set(all.map((p) => p.join())).size).toBe(24);
  });

  it('for every ordering, results, core calls and each layer’s log count match the independent rule', () => {
    for (const order of all) {
      const r = runStack(order);
      expect(r.results).toEqual(['Ada', 'Ada']);
      expect(r.coreCalls).toBe(2);
      const count = (l: string) => r.logs.filter((x) => x.startsWith(`${l}:`)).length;
      expect([order.join(), count('logging')]).toEqual([order.join(), 2 * passes(order, 'logging')]);
      expect([order.join(), count('timing')]).toEqual([order.join(), passes(order, 'timing')]);
      expect([order.join(), count('retry')]).toEqual([order.join(), 1]);
      const cacheMisses = inside(order, 'caching', 'retry') ? 2 : 1;
      expect(r.logs.filter((x) => x.startsWith('caching: miss')).length).toBe(cacheMisses);
      expect(r.logs.filter((x) => x.startsWith('caching: hit')).length).toBe(1);
    }
  });

  it('timing measures what it wraps: the whole retry outside it, one attempt inside it', () => {
    const outside = runStack(['timing', 'retry', 'caching', 'logging']).logs.filter((l) => l.startsWith('timing'));
    expect(outside[0]).toBe(`timing: ${TIME.coreFail + TIME.backoff + TIME.coreOk} ms`);
    const insideRetry = runStack(['retry', 'timing', 'caching', 'logging']).logs.filter((l) => l.startsWith('timing'));
    expect(insideRetry.slice(0, 2)).toEqual([`timing: ${TIME.coreFail} ms`, `timing: ${TIME.coreOk} ms`]);
  });

  it('the presets show the claims the scene makes', () => {
    const [cacheOut, retryOut, logIn] = DECORATOR_PRESETS.map((p) => runStack(p.order));
    // Caching outside retry: the second call's hit never enters retry.
    expect(cacheOut.trace.filter((e) => e.call === 2 && e.layer === 'retry')).toEqual([]);
    expect(retryOut.trace.filter((e) => e.call === 2 && e.layer === 'retry' && e.kind === 'enter')).toHaveLength(1);
    // Logging inside the cache never sees the hit.
    expect(logIn.trace.filter((e) => e.call === 2 && e.layer === 'logging')).toEqual([]);
  });

  it('subsets: without retry the first call fails and is not cached', () => {
    const r = runStack(['logging', 'caching']);
    expect(r.results).toEqual(['error: timeout', 'Ada']);
    expect(r.coreCalls).toBe(2);
  });

  it('frames print every log line in order and end on the real results', () => {
    for (const order of [...all, ['caching'] as LayerId[], [] as LayerId[]]) {
      const r = runStack(order);
      const frames = stackFrames(order);
      expect(frames.at(-1)!.printed).toEqual(r.logs);
      // Lines only ever accumulate, so every frame's console is a prefix of the full log.
      for (const f of frames) expect(r.logs.slice(0, f.printed.length)).toEqual(f.printed);
      expect(captionText(frames.at(-1)!.say)).toContain(`Results: ${r.results.join(', ')}`);
    }
  });
});
