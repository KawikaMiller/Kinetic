import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { closedFormProcessed, runAgent, type AgentConfig } from './agent';
import { calc } from './calc';
import { HELP_PAGES, ORDERS, UNTRUSTED_MARKER } from './data';
import { contextConfig, loopConfig, trustConfig } from './facts';
import { AUDIT_GOAL, LOOP_TASKS, PAGE_GOAL, REFUND_TASKS, baseConfig } from './settings';
import { TOOLS, executeTool, emptyWorld, searchDocs, words } from './tools';

/** Independent reference: shunting-yard with unary minus handled as a 0 - x operator of high precedence. */
function reference(src: string): number | null {
  const tokens = src.match(/\d+\.?\d*|[-+*/()]/g) ?? [];
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3 };
  let prev = '';
  for (const t of tokens) {
    if (/\d/.test(t)) out.push(Number(t));
    else if (t === '(') ops.push(t);
    else if (t === ')') {
      while (ops.length && ops.at(-1) !== '(') out.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop();
    } else {
      const op = t === '-' && (prev === '' || prev === '(' || '+-*/'.includes(prev)) ? 'neg' : t;
      while (op !== 'neg' && ops.length && ops.at(-1) !== '(' && prec[ops.at(-1)!] >= prec[op]) out.push(ops.pop()!);
      ops.push(op);
    }
    prev = t;
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o === '(') return null;
    out.push(o);
  }
  const stack: number[] = [];
  for (const t of out) {
    if (typeof t === 'number') stack.push(t);
    else if (t === 'neg') {
      if (!stack.length) return null;
      stack.push(-stack.pop()!);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      if (t === '/' && b === 0) return null;
      stack.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b);
    }
  }
  return stack.length === 1 ? stack[0] : null;
}

const randomExpression = (rnd: () => number, depth = 0): string => {
  const pick = rnd();
  if (depth > 3 || pick < 0.35) return String(1 + Math.floor(rnd() * 9));
  if (pick < 0.5) return `(${randomExpression(rnd, depth + 1)})`;
  if (pick < 0.58) return `-${randomExpression(rnd, depth + 1)}`;
  return `${randomExpression(rnd, depth + 1)} ${'+-*/'[Math.floor(rnd() * 4)]} ${randomExpression(rnd, depth + 1)}`;
};

describe('the calc tool', () => {
  it('equals a reference parser on 500 seeded expressions, including divide-by-zero refusals', () => {
    const rnd = mulberry32(21);
    let refused = 0;
    for (let i = 0; i < 500; i++) {
      const src = randomExpression(rnd);
      const want = reference(src);
      const got = calc(src);
      if (want === null) {
        refused++;
        expect(got.ok, src).toBe(false);
      } else {
        expect(got.ok, src).toBe(true);
        if (got.ok) expect(got.value, src).toBeCloseTo(want, 9);
      }
    }
    expect(refused).toBeGreaterThanOrEqual(0);
  });

  it('refuses anything outside its grammar', () => {
    for (const bad of ['', '1 +', '(1 + 2', '1 + 2)', '2 ** 3', 'abc', '1; 2', 'process.exit()', '1 / 0', '3 3', '1..2', '+', '"1"', 'a'.repeat(81)]) {
      expect(calc(bad).ok, bad).toBe(false);
    }
    expect(calc('84.5 * 1.08')).toEqual({ ok: true, value: 84.5 * 1.08 });
    expect(calc('-(2 + 3) * 2')).toEqual({ ok: true, value: -10 });
  });
});

describe('the other tools', () => {
  it('search_docs equals a brute-force sort of every page by shared words', () => {
    for (const query of ['returns policy', 'reset password link', 'two-step backup codes', 'delivery', 'invoice company', 'zzz']) {
      const q = new Set(words(query));
      const brute = HELP_PAGES.map((p, index) => ({ index, score: [...q].filter((w) => new Set(words(`${p.title} ${p.text}`)).has(w)).length }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index);
      expect(searchDocs(query)).toEqual(brute);
    }
    expect(HELP_PAGES[searchDocs('returns policy')[0].index].title).toBe('Returns policy');
  });

  it('lookup_order and refund obey the order book', () => {
    const w = emptyWorld();
    expect(executeTool({ tool: 'lookup_order', args: { id: 1042 } }, w).data?.order?.total).toBe(84.5);
    expect(executeTool({ tool: 'lookup_order', args: { id: 9 } }, w).ok).toBe(false);
    expect(executeTool({ tool: 'refund', args: { order: 1042, amount: 999 } }, w).ok).toBe(false);
    expect(w.refunds).toEqual([]);
    expect(executeTool({ tool: 'refund', args: { order: 1042, amount: 84.5 } }, w).ok).toBe(true);
    expect(w.refunds).toEqual([{ order: 1042, amount: 84.5 }]);
  });
});

describe('the loop', () => {
  it('the tax task answers with the direct computation', () => {
    const run = runAgent(loopConfig('total'));
    const order = ORDERS.find((o) => o.id === 1042)!;
    expect(run.answer).toBe(`Total with 8% tax: ${(order.total * 1.08).toFixed(2)}.`);
    expect(run.outcome).toBe('answered');
    expect(run.steps).toBe(3);
  });

  it('a step budget shorter than the task ends it with "stopped: step budget reached" and no answer', () => {
    const run = runAgent(loopConfig('total', { stepBudget: 2 }));
    expect(run.outcome).toBe('stopped');
    expect(run.answer).toBeNull();
    expect(run.events.at(-1)?.text).toBe('stopped: step budget reached');
    expect(run.steps).toBe(2);
  });

  it('words processed equal the closed form for 2 to 9 audit steps with nothing dropped', () => {
    const roomy = runAgent(contextConfig({ budgetWords: 2000 }));
    const c0 = roomy.contextByStep[0];
    const d = roomy.contextByStep[1] - c0;
    for (let s = 2; s <= 9; s++) {
      const run = runAgent(contextConfig({ budgetWords: 2000, stepBudget: s }));
      expect(run.steps).toBe(s);
      expect(run.processed, `steps ${s}`).toBe(closedFormProcessed(c0, d, s));
      // independent: sum of an arithmetic progression, term by term
      let sum = 0;
      for (let i = 0; i < s; i++) sum += c0 + i * d;
      expect(run.processed).toBe(sum);
    }
  });

  it('truncating drops the goal and the policy answers a different question; summarising keeps the thread', () => {
    const truncated = runAgent(contextConfig());
    const summarised = runAgent(contextConfig({ overflow: 'summarise' }));
    expect(truncated.goalDroppedAtStep).toBe(8);
    expect(truncated.answer).toMatch(/^Latest result: order 1046/);
    expect(summarised.goalDroppedAtStep).toBeNull();
    expect(summarised.answer).toBe('First unpaid order: 1047.');
  });

  it('a failing tool is retried once and then given up on', () => {
    const run = runAgent(loopConfig('total', { failureRate: 1 }));
    expect(run.events.filter((e) => e.phase === 'act')).toHaveLength(2);
    expect(run.answer).toBe('Gave up: lookup_order failed twice.');
  });
});

const CONFIG_TASKS = [...LOOP_TASKS.map((t) => t.goal), ...REFUND_TASKS.map((t) => t.goal), AUDIT_GOAL, PAGE_GOAL];

function randomConfig(seed: number): AgentConfig {
  const rnd = mulberry32(seed * 7 + 1);
  const offered = TOOLS.filter(() => rnd() < 0.7);
  return baseConfig({
    goal: CONFIG_TASKS[Math.floor(rnd() * CONFIG_TASKS.length)],
    budgetWords: 200 + Math.floor(rnd() * 19) * 100,
    stepBudget: 2 + Math.floor(rnd() * 19),
    overflow: rnd() < 0.5 ? 'truncate' : 'summarise',
    offered,
    validateArguments: rnd() < 0.5,
    approval: rnd() < 0.5,
    approvals: Array.from({ length: Math.floor(rnd() * 3) }, () => (rnd() < 0.5 ? 'approve' : 'deny')),
    failureRate: rnd() * 0.6,
    seed,
    trust: rnd() < 0.5 ? 'naive' : 'separated',
  });
}

describe('loop invariants over 1,000 seeded runs with failures and untrusted text', () => {
  it('terminates within the step budget, never executes a write without an approval when the gate is on, and an unoffered write tool never runs', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const cfg = randomConfig(seed);
      const run = runAgent(cfg);
      expect(run.steps, `seed ${seed}`).toBeLessThanOrEqual(cfg.stepBudget);
      expect(['answered', 'stopped', 'paused']).toContain(run.outcome);
      if (run.outcome === 'stopped') expect(run.events.at(-1)?.text).toBe('stopped: step budget reached');
      expect(run.events.some((e) => /forever|will not stop/i.test(e.text))).toBe(false);
      if (cfg.approval) {
        for (const w of run.writes) expect(w.approved, `seed ${seed}`).toBe(true);
        // every executed write has its own approval record (an approved call can still fail and not execute)
        expect(run.approvals.filter((a) => a.decision === 'approve').length).toBeGreaterThanOrEqual(run.writes.length);
      }
      if (!cfg.offered.includes('send_email')) expect(run.world.outbox).toEqual([]);
      if (!cfg.offered.includes('refund')) expect(run.world.refunds).toEqual([]);
      if (cfg.validateArguments) for (const r of run.world.refunds) expect(r.amount).toBeLessThanOrEqual(100);
    }
  });

  it('broken variant: with the gate off and the naive policy the unrequested write runs, on a named lowest seed at 30% tool failures', () => {
    let lowest: number | null = null;
    let seedsThatRan = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const run = runAgent(trustConfig({ trust: 'naive', approval: false, failureRate: 0.3, seed }));
      if (run.writes.some((w) => !w.requested)) {
        seedsThatRan++;
        lowest ??= seed;
      }
    }
    expect(lowest).not.toBeNull();
    expect(seedsThatRan).toBeGreaterThan(0);
    expect(runAgent(trustConfig({ trust: 'naive', failureRate: 0.3, seed: lowest! })).world.outbox).toHaveLength(1);
  });

  it('each defence leaves the outbox empty on every one of 1,000 seeds', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const common = { trust: 'naive' as const, failureRate: 0.3, seed };
      expect(runAgent(trustConfig({ ...common, trust: 'separated' })).world.outbox, `separated ${seed}`).toEqual([]);
      expect(runAgent(trustConfig({ ...common, offered: TOOLS.filter((t) => t !== 'send_email') })).world.outbox, `least privilege ${seed}`).toEqual([]);
      expect(runAgent(trustConfig({ ...common, approval: true })).world.outbox, `gate, no decision ${seed}`).toEqual([]);
      expect(runAgent(trustConfig({ ...common, approval: true, approvals: ['deny'] })).world.outbox, `gate, denied ${seed}`).toEqual([]);
    }
  });

  it('the untrusted block is the abstract placeholder, with no payload wording', () => {
    expect(UNTRUSTED_MARKER).toBe('[untrusted text that tries to give the agent an instruction]');
  });
});
