import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { NO_ADAPTER_ERROR, adapterFrames, builderCaption, factoryCaption, stackFrames } from './frames';
import {
  ADAPTER_CODE, ALL_CHOICES, ARG_NAMES, RequestBuilder, builderLines, positionalArgs, CALL_SITES, DECORATOR_PRESETS, FACTORY_FILE, LAYERS, TIME, appCode, buildFrom, legacyWeather, permutations, runStack, touchedFiles,
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
      c.method === 'GET' && c.body && 'a GET request cannot have a body (this builder, like fetch, refuses it)',
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

describe('builder: both versions are the same request', () => {
  it('for all 16 choices the positional arguments and the builder steps carry the same seven values', () => {
    for (const c of ALL_CHOICES) {
      const r = buildFrom(c);
      // Safe: fixed, lesson-authored text; the arguments follow the controls.
      const positional = new Function(`return [${positionalArgs(c).join(', ')}];`)() as unknown[];
      expect(positional).toHaveLength(7);
      const viaSteps = new Function('RequestBuilder', `${builderLines(c).join('\n')}\nreturn req;`)(RequestBuilder) as ReturnType<typeof buildFrom>;
      expect(viaSteps).toEqual(r);
      if (r.ok) {
        const q = r.request;
        expect(positional).toEqual([q.url, q.method, q.body, q.followRedirects, q.retries, q.timeoutMs, q.cache]);
      } else {
        // An invalid request is still the same seven values on both sides.
        expect(positional[1]).toBe(c.method);
        expect(positional[2] === null).toBe(!c.body);
        expect(positional[4]).toBe(c.retries);
        expect(positional[5]).toBe(c.timeoutMs);
      }
    }
    expect(ARG_NAMES).toHaveLength(7);
    // Every one of the seven settings has a step in the builder version.
    const steps = builderLines(ALL_CHOICES[0]).join('\n');
    for (const name of ['method', 'followRedirects', 'retries', 'timeout', 'cache']) expect(steps).toContain(`.${name}(`);
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

  it('every exit event reports the real outcome of its call: ok=false from the failing core until retry catches it, for all 24 orderings and subsets', () => {
    const check = (order: LayerId[]) => {
      const r = runStack(order);
      let failing = false;
      let call = 0;
      for (const e of r.trace) {
        if (e.call !== call) {
          call = e.call;
          failing = false;
        }
        if (e.kind === 'retry') failing = false;
        if (e.kind !== 'exit') continue;
        if (e.layer === 'core') failing = !e.ok;
        else expect([order.join(), e.call, e.layer, e.ok]).toEqual([order.join(), e.call, e.layer, !failing]);
      }
      // The outermost layer's last exit agrees with what the caller got.
      for (let c = 1; c <= 2; c++) {
        const exits = r.trace.flatMap((e) => (e.kind === 'exit' && e.call === c && e.layer === order[0] ? [e.ok] : []));
        if (order.length) expect([order.join(), c, exits.at(-1)]).toEqual([order.join(), c, !r.results[c - 1].startsWith('error')]);
      }
    };
    for (const order of all) check(order);
    for (const order of [['timing'], ['timing', 'caching'], ['logging', 'timing'], ['caching', 'timing', 'retry']] as LayerId[][]) check(order);
  });

  it('the timing layer inside retry reports the failed attempt as an error, and the caption says error, not response', () => {
    const order: LayerId[] = ['logging', 'caching', 'retry', 'timing'];
    const timingExits = runStack(order).trace.filter((e) => e.kind === 'exit' && e.layer === 'timing' && e.call === 1);
    expect(timingExits.map((e) => e.kind === 'exit' && e.ok)).toEqual([false, true]);
    const frames = stackFrames(order);
    const failed = frames.filter((f) => f.active === 'timing' && f.direction === 'out' && !f.ok);
    expect(failed.length).toBe(1);
    expect(captionText(failed[0].say)).toContain('The error passes back out through timing');
    expect(captionText(failed[0].say)).not.toContain('The response passes');
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
