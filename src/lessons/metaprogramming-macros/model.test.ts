/**
 * Independent oracles: hand-worked values, a reference interpreter that never substitutes (it binds each
 * parameter to the argument and evaluates it where it is used, by name), plain token substitution on strings,
 * and real JavaScript (a real Proxy, JSON.stringify).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { evaluate } from './expand';
import { parseCall, parseMacroDef, type MacroDef, type Node } from './macroLang';
import { BASE, EXTRA, FIELD_IDS, PROBES, generate, handWritten, objectWith, probe, reflective, trapText, type FieldId } from './reflection';
import { runMacro, varsFor } from './run';
import type { Strategy } from './expand';
import { MISTAKES, PHASES, TECHNIQUES, runPipeline } from './phases';

const def = (text: string): MacroDef => {
  const r = parseMacroDef(text);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r.value;
};
const call = (text: string) => {
  const r = parseCall(text);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r;
};
const go = (strategy: Strategy, macro: string, callText: string, a = 4) => {
  const c = call(callText);
  return runMacro(strategy, def(macro), c.tokens, c.tree, a);
};
const value = (r: ReturnType<typeof go>) => (r.evaluated && r.evaluated.ok ? r.evaluated.value : r.evaluated);

describe('hand-worked values', () => {
  it('SQUARE(a + 1) at a = 4: text substitution gives 9 (a + 1 * a + 1), the tree strategies give 25', () => {
    const text = go('text', 'macro SQUARE(x) = x * x', 'SQUARE(a + 1)');
    expect(text.source).toBe('a + 1 * a + 1');
    expect(value(text)).toBe(9);
    expect(value(go('tree', 'macro SQUARE(x) = x * x', 'SQUARE(a + 1)'))).toBe(25);
    expect(go('tree', 'macro SQUARE(x) = x * x', 'SQUARE(a + 1)').source).toBe('(a + 1) * (a + 1)');
    expect(value(go('hygienic', 'macro SQUARE(x) = x * x', 'SQUARE(a + 1)'))).toBe(25);
  });

  it('SQUARE(next()) evaluates the argument twice (1 * 2 = 2); binding it once with let gives 1', () => {
    const twice = go('tree', 'macro SQUARE(x) = x * x', 'SQUARE(next())');
    expect(twice.source).toBe('next() * next()');
    expect(twice.evaluated).toEqual({ ok: true, value: 2, nextCalls: 2 });
    const once = go('tree', 'macro SQUARE(x) = let t = x in t * t', 'SQUARE(next())');
    expect(once.evaluated).toEqual({ ok: true, value: 1, nextCalls: 1 });
  });

  it('M(tmp) with the template let tmp = 10 in x + tmp: 20 when the caller\'s tmp is captured, 12 when hygienic (tmp#1)', () => {
    const m = 'macro M(x) = let tmp = 10 in x + tmp';
    expect(value(go('text', m, 'M(tmp)'))).toBe(20);
    expect(value(go('tree', m, 'M(tmp)'))).toBe(20);
    const clean = go('hygienic', m, 'M(tmp)');
    expect(value(clean)).toBe(12);
    expect(clean.source).toBe('let tmp#1 = 10 in tmp + tmp#1');
    expect(go('tree', m, 'M(tmp)').problems?.captured).toHaveLength(1);
    expect(clean.problems?.captured).toHaveLength(0);
  });

  it('text substitution marks the regrouped operators as problems and the tree strategies do not', () => {
    expect(go('text', 'macro SQUARE(x) = x * x', 'SQUARE(a + 1)').problems?.regrouped).toHaveLength(2);
    expect(go('tree', 'macro SQUARE(x) = x * x', 'SQUARE(a + 1)').problems?.regrouped).toHaveLength(0);
    expect(go('text', 'macro SQUARE(x) = x * x', 'SQUARE(a)').problems?.regrouped).toHaveLength(0);
  });
});

// ── A reference interpreter that never substitutes ──────────────────

type Env = Readonly<Record<string, number>>;

/**
 * Evaluates a macro call by name: each parameter is the argument expression, evaluated at each use. `lexical`
 * evaluates it in the caller's environment (what hygiene gives); otherwise in the environment at the use, which
 * includes the template's own binders (what plain tree substitution gives).
 */
function reference(macro: MacroDef, args: readonly Node[], callerEnv: Env, lexical: boolean): { value: number; calls: number } | string {
  let calls = 0;
  const ev = (n: Node, env: Env): number => {
    switch (n.kind) {
      case 'num':
        return Number(n.text);
      case 'next':
        return ++calls;
      case 'var': {
        const p = macro.params.indexOf(n.text);
        if (p >= 0 && !Object.hasOwn(env, `#bound:${n.text}`)) return ev(args[p], lexical ? callerEnv : env);
        if (!Object.hasOwn(env, n.text)) throw new Error(`unknown name "${n.text}"`);
        return env[n.text];
      }
      case 'let': {
        const v = ev(n.kids[0], env);
        return ev(n.kids[1], { ...env, [n.text]: v });
      }
      case 'bin': {
        const l = ev(n.kids[0], env);
        const r = ev(n.kids[1], env);
        if (n.text === '+') return l + r;
        if (n.text === '-') return l - r;
        if (n.text === '*') return l * r;
        if (r === 0) throw new Error('division by zero in this toy language');
        return l / r;
      }
      default:
        throw new Error('unsupported');
    }
  };
  try {
    return { value: ev(macro.bodyTree, callerEnv), calls };
  } catch (e) {
    return (e as Error).message;
  }
}

function expression(rnd: Rnd, depth: number, names: readonly string[], binders: readonly string[], withNext: boolean): string {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const r = rnd();
  if (depth <= 0 || r < 0.3) {
    const leaf = rnd();
    if (leaf < 0.35) return String(Math.floor(rnd() * 10));
    if (leaf < 0.5 && withNext) return 'next()';
    return pick(names);
  }
  if (r < 0.45 && binders.length) {
    const b = pick(binders);
    return `(let ${b} = ${expression(rnd, depth - 1, names, binders, withNext)} in ${expression(rnd, depth - 1, [...names, b], binders, withNext)})`;
  }
  const op = pick(['+', '-', '*', '+', '*', '/']);
  return `(${expression(rnd, depth - 1, names, binders, withNext)} ${op} ${expression(rnd, depth - 1, names, binders, withNext)})`;
}

function randomCase(rnd: Rnd): { macro: string; call: string } {
  for (;;) {
    const template = expression(rnd, 3, ['x', 'y', 'a'], ['tmp', 't'], true);
    const arg1 = expression(rnd, 2, ['a', 'tmp'], [], true);
    const arg2 = expression(rnd, 2, ['a', 'tmp'], [], true);
    const macro = `macro M(x, y) = ${template}`;
    const callText = `M(${arg1}, ${arg2})`;
    if (template.length <= 60 && callText.length <= 40) return { macro, call: callText };
  }
}

describe('against the reference interpreter, on 500 seeded (template, argument) pairs', () => {
  const rnd = mulberry32(7);
  const cases = Array.from({ length: 500 }, () => randomCase(rnd));

  it('the tree strategy equals by-name evaluation in the environment of the use, and hygienic equals by-name evaluation in the caller\'s', () => {
    let compared = 0;
    let differ = 0;
    for (const c of cases) {
      const macro = def(c.macro);
      const parsedCall = call(c.call);
      const env = varsFor(4);
      for (const [strategy, lexical] of [['tree', false], ['hygienic', true]] as const) {
        const mine = runMacro(strategy, macro, parsedCall.tokens, parsedCall.tree, 4);
        const ref = reference(macro, parsedCall.tree.kids, env, lexical);
        if (typeof ref === 'string') {
          expect(mine.evaluated && !mine.evaluated.ok ? mine.evaluated.error : null, `${c.macro} ${c.call} ${strategy}`).toBe(ref);
        } else {
          expect(mine.evaluated, `${c.macro} ${c.call} ${strategy}`).toEqual({ ok: true, value: ref.value, nextCalls: ref.calls });
          compared++;
        }
      }
      const a = reference(macro, parsedCall.tree.kids, env, false);
      const b = reference(macro, parsedCall.tree.kids, env, true);
      if (typeof a !== 'string' && typeof b !== 'string' && a.value !== b.value) differ++;
    }
    expect(compared).toBeGreaterThan(400);
    expect(differ).toBeGreaterThan(5);
  });

  it('the hygienic result does not change when the caller\'s variable is renamed (alpha-equivalence)', () => {
    for (const c of cases) {
      const macro = def(c.macro);
      const original = call(c.call);
      const renamed = call(c.call.replace(/\btmp\b/g, 'zz'));
      const before = runMacro('hygienic', macro, original.tokens, original.tree, 4);
      const run = runMacro('hygienic', macro, renamed.tokens, renamed.tree, 4);
      const after = run.expanded.ok ? evaluate(run.expanded.tree, { a: 4, zz: 2 }) : null;
      expect(after, `${c.macro} ${c.call}`).toEqual(before.evaluated);
    }
  });

  it('the plain tree result is not invariant: renaming the caller\'s tmp changes 20 into 12 (a named case)', () => {
    const macro = def('macro M(x) = let tmp = 10 in x + tmp');
    const original = call('M(tmp)');
    const renamed = call('M(zz)');
    const before = runMacro('tree', macro, original.tokens, original.tree, 4).evaluated;
    const run = runMacro('tree', macro, renamed.tokens, renamed.tree, 4);
    const after = run.expanded.ok ? evaluate(run.expanded.tree, { a: 4, zz: 2 }) : null;
    expect([before, after]).toEqual([{ ok: true, value: 20, nextCalls: 0 }, { ok: true, value: 12, nextCalls: 0 }]);
  });
});

describe('text substitution against plain token substitution on strings', () => {
  it('equals substituting the argument text into the template text (spaces between tokens) and reading the result', () => {
    const rnd = mulberry32(21);
    let checked = 0;
    while (checked < 300) {
      const template = expression(rnd, 2, ['x', 'a'], [], false);
      const arg = expression(rnd, 2, ['a', 'tmp'], [], false).replace(/[()]/g, (m) => ` ${m} `).replace(/\s+/g, ' ').trim();
      const spaced = template.replace(/[()]/g, (m) => ` ${m} `).replace(/\s+/g, ' ').trim();
      const substituted = spaced.split(' ').map((w) => (w === 'x' ? arg : w)).join(' ');
      if (substituted.length > 40 || `M(${arg})`.length > 40) continue;
      const mine = go('text', `macro M(x) = ${template}`, `M(${arg})`);
      const direct = evaluate((call(substituted) as { tree: Node }).tree, varsFor(4));
      expect(mine.evaluated, `${template} / ${arg}`).toEqual(direct);
      checked++;
    }
  });

  it('agrees with tree substitution for every atomic argument, and differs for a compound one', () => {
    for (const m of ['macro S(x) = x * x', 'macro S(x) = x - x * 2', 'macro S(x) = 10 / x / x']) {
      for (const arg of ['a', '3', 'tmp']) expect(value(go('text', m, `S(${arg})`)), `${m} ${arg}`).toBe(value(go('tree', m, `S(${arg})`)));
    }
    expect(value(go('text', 'macro S(x) = x * x', 'S(a + 1)'))).not.toBe(value(go('tree', 'macro S(x) = x * x', 'S(a + 1)')));
  });
});

describe('hostile input', () => {
  it('a template over 60 characters is refused', () => {
    const r = parseMacroDef(`macro M(x) = ${'x + '.repeat(20)}x`);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('limit is 60') });
  });

  it.each([
    ['macro', /needs a name of its own/],
    ['macro M(x) = (x + 1', /expected "\)"/],
    ['macro M(x) = x +', /an expression is missing/],
    ['macro M(x y) = x', /separate parameters with commas/],
    ['macro M(x, x) = x', /appears twice/],
    ['macro M(x) =', /template is empty/],
    ['macro M(x) = x $ 2', /unexpected "\$"/],
  ])('definition %s is refused', (text, message) => {
    const r = parseMacroDef(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it('the call is read by the same parser, with a column', () => {
    const r = parseCall('M(1 +)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Column 6/);
    expect(parseCall('M(' + '1,'.repeat(25) + '1)').ok).toBe(false);
  });

  it('division by zero is refused with the toy language\'s sentence, never Infinity; unknown names are named', () => {
    expect(go('tree', 'macro D(x) = 1 / x', 'D(a - a)').evaluated).toEqual({ ok: false, error: 'division by zero in this toy language' });
    expect(go('tree', 'macro D(x) = x + q', 'D(1)').evaluated).toEqual({ ok: false, error: 'unknown name "q"' });
  });

  it('a macro that expands into itself stops at the limit of 20, in every strategy', () => {
    for (const s of ['text', 'tree', 'hygienic'] as const) {
      const r = go(s, 'macro R(x) = R(x) + 1', 'R(a)');
      expect(r.expanded).toEqual({ ok: false, error: expect.stringContaining('Stopped at the expansion limit of 20') });
    }
  });

  it('nested calls that multiply the size are refused past 500 nodes, quickly, in every strategy', () => {
    const thirty = 'macro M(x) = ' + Array.from({ length: 30 }, () => 'x').join('+');
    const started = Date.now();
    for (const s of ['text', 'tree', 'hygienic'] as const) {
      const r = go(s, thirty, 'M(M(M(M(a))))');
      expect(r.expanded, s).toEqual({ ok: false, error: expect.stringContaining('Stopped: the expansion grew past 500') });
      expect(r.source).toBeNull();
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('the size cap sits where the arithmetic says: x+x nested n deep has 2^n leaves and 2^n - 1 plus signs', () => {
    const nest = (n: number) => 'M('.repeat(n) + 'a' + ')'.repeat(n);
    for (const s of ['tree', 'hygienic'] as const) {
      const ok = go(s, 'macro M(x) = x + x', nest(7));
      expect(ok.expanded.ok, s).toBe(true);
      expect(value(ok), s).toBe(128 * 4);
      expect(go(s, 'macro M(x) = x + x', nest(8)).expanded, s).toEqual({ ok: false, error: expect.stringContaining('grew past 500') });
    }
    // Text substitution re-expands every copied argument, so it meets the 20-expansion limit first: 2^n - 1 expansions.
    expect(value(go('text', 'macro M(x) = x + x', nest(4)))).toBe(16 * 4);
    expect(go('text', 'macro M(x) = x + x', nest(5)).expanded).toEqual({ ok: false, error: expect.stringContaining('expansion limit of 20') });
  });

  it('a value that overflows is refused, not shown as Infinity', () => {
    const thirty = 'macro P(x) = ' + Array.from({ length: 30 }, () => 'x').join('*');
    const r = go('tree', thirty, 'P(999999999999999)');
    expect(r.evaluated).toEqual({ ok: false, error: expect.stringContaining('too large') });
  });

  it('an unknown macro is named the same way by every strategy', () => {
    const errors = (['text', 'tree', 'hygienic'] as const).map((s) => go(s, 'macro M(x) = x + 1', 'T(1)').expanded);
    for (const e of errors) expect(e).toEqual({ ok: false, error: 'Unknown macro T: only M is defined here.' });
  });

  it('a wrong number of arguments is refused', () => {
    expect(go('tree', 'macro M(x, y) = x + y', 'M(1)').expanded).toEqual({ ok: false, error: 'M takes 2 arguments but the call gives 1.' });
  });
});

describe('the reflection panel, real JavaScript', () => {
  it('the proxy log is what the real traps saw', () => {
    const logs = Object.fromEntries(PROBES.map((p) => [p.id, probe(p, BASE)]));
    expect(logs['read-name'].log.map(trapText)).toEqual(["get('name')"]);
    expect(logs['read-name'].value).toBe('"Ada"');
    expect(logs['read-email'].value).toBe('undefined');
    expect(logs['has-age'].log.map(trapText)).toEqual(["has('age')"]);
    expect(logs['has-age'].value).toBe('true');
    expect(logs['object-keys'].log.map(trapText)).toEqual(['ownKeys()']);
    expect(logs['object-keys'].value).toBe('["name","age"]');
    expect(logs['reflect-own-keys'].value).toBe('["name","age"]');
  });

  it('adding a field changes what Object.keys sees, because the proxy reads the object live', () => {
    const target = objectWith(['email']);
    expect(probe(PROBES.find((p) => p.id === 'object-keys')!, target).value).toBe('["name","age","email"]');
    expect(probe(PROBES.find((p) => p.id === 'read-email')!, target).value).toBe('"ada@example.com"');
  });

  it('the reflective serialiser equals JSON.stringify for every subset and order of added fields', () => {
    const orders: FieldId[][] = [[]];
    for (const a of FIELD_IDS) {
      orders.push([a]);
      for (const b of FIELD_IDS) if (b !== a) orders.push([a, b]);
    }
    orders.push(['email', 'admin', 'score'], ['score', 'email', 'admin']);
    for (const added of orders) {
      const o = objectWith(added);
      expect(reflective(o)).toBe(JSON.stringify(o));
    }
  });

  it('the generated serialiser is stale after a field is added and right again after regenerating; the hand-written one needs its edit', () => {
    const generated = generate(BASE);
    const o = objectWith(['email']);
    expect(generated.serialise(o)).toBe(JSON.stringify(BASE));
    expect(generated.serialise(o)).not.toBe(JSON.stringify(o));
    expect(generate(o).serialise(o)).toBe(JSON.stringify(o));
    expect(handWritten([])(o)).not.toBe(JSON.stringify(o));
    expect(handWritten(['email'])(o)).toBe(JSON.stringify(o));
  });

  it('once every added field is edited in, the hand-written serialiser matches JSON.stringify for every order of adding', () => {
    const orders: FieldId[][] = [[]];
    for (const a of FIELD_IDS) {
      orders.push([a]);
      for (const b of FIELD_IDS.filter((x) => x !== a)) {
        orders.push([a, b]);
        for (const c of FIELD_IDS.filter((x) => x !== a && x !== b)) orders.push([a, b, c]);
      }
    }
    expect(orders).toHaveLength(16);
    for (const added of orders) {
      const o = objectWith(added);
      expect(handWritten(added)(o), added.join(',')).toBe(JSON.stringify(o));
      expect(generate(o).serialise(o), added.join(',')).toBe(JSON.stringify(o));
    }
    expect(EXTRA.email).toBe('ada@example.com');
  });
});

describe('the phase table', () => {
  /** Typed once, by hand, from the rules in the spec: the pipeline's answers must equal it. */
  const expected = {
    macro: { misspelled: 'expansion', 'wrong-type': 'never', 'added-later': 'never' },
    codegen: { misspelled: 'generation', 'wrong-type': 'never', 'added-later': 'never' },
    decorator: { misspelled: 'definition', 'wrong-type': 'definition', 'added-later': 'never' },
    reflection: { misspelled: 'never', 'wrong-type': 'first-call', 'added-later': 'fine' },
    proxy: { misspelled: 'access', 'wrong-type': 'access', 'added-later': 'fine' },
  } as const;

  it('every cell is what the pipeline produced, and the phases that ran are the ones before and including the one that caught it', () => {
    const order = PHASES.map((p) => p.id);
    for (const t of TECHNIQUES) {
      for (const m of MISTAKES) {
        const out = runPipeline(t, m.id);
        const got = out.kind === 'surfaces' ? out.phase : out.kind;
        expect(got, `${t.id} / ${m.id}`).toBe(expected[t.id][m.id]);
        expect(out.ran).toEqual(out.kind === 'surfaces' ? order.slice(0, order.indexOf(out.phase) + 1) : order);
      }
    }
  });
});

describe('no learner text reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
  it('the lesson sources contain no new RegExp, RegExp( call, eval( or new Function', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.map(([name]) => name)).toContain('./expand.ts');
    for (const [name, text] of files) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/new\s+RegExp|RegExp\s*\(|\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
  });
});
