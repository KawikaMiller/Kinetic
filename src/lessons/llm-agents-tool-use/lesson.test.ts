import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { unscopedAbsolutes } from '../../core/lessonContentT3';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { runAgent } from './agent';
import { AUDIT_ANSWER, contextCaption, guardCaption, loopCaption, trustCaption } from './captions';
import { contextConfig, contextFacts, guardConfig, guardFacts, loopConfig, loopFacts, trustConfig, trustFacts } from './facts';
import lesson from './index';
import { CONTEXT_DEFAULT, GUARD_DEFAULT, GUARD_PRESETS, LOOP_DEFAULT, LOOP_TASKS, REFUND_TASKS, TRUST_DEFAULT } from './settings';
import { TOOLS } from './tools';
import { eventRows } from './view';

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('llm-agents-tool-use')).toHaveLength(4);
    expect(sharedSceneComponents('llm-agents-tool-use')).toEqual([]);
    expect(sceneElements('llm-agents-tool-use').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(LOOP_DEFAULT).toEqual({ task: 'total', budgetWords: 1000, stepBudget: 12 });
    expect(CONTEXT_DEFAULT).toEqual({ stepBudget: 20, budgetWords: 200, overflow: 'truncate' });
    expect(GUARD_DEFAULT).toEqual({ task: 'r1042', preset: 'readonly', failureRate: 0, seed: 7 });
    expect(TRUST_DEFAULT).toEqual({ trust: 'naive', emailOffered: true, approval: false, seed: 7 });
    expect(GUARD_PRESETS.readonly.guards.offered).not.toContain('refund');
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: the tax task answers in 3 calls, and a step budget of 2 stops it with no answer', () => {
    const f = loopFacts();
    expect(f.total.outcome).toBe('answered');
    expect(f.steps).toBe(3);
    expect(f.total.answer).toBe('Total with 8% tax: 91.26.');
    expect(f.tight.outcome).toBe('stopped');
    expect(f.tight.answer).toBeNull();
    expect(lesson.tryThis[0]).toContain('3 model calls');
    expect(lesson.tryThis[0]).toContain('Set Step budget to 2');
  });

  it('try-this 2: at 200 words truncation drops the goal at step 8, summarising finds order 1047, and 2,000 words read 1,242 words in 9 calls', () => {
    const f = contextFacts();
    expect(f.open.goalDroppedAtStep).toBe(8);
    expect(f.open.answer).not.toBe(AUDIT_ANSWER);
    expect(f.summarised.answer).toBe(AUDIT_ANSWER);
    expect(f.roomy.processed).toBe(1242);
    expect(f.roomy.steps).toBe(9);
    expect(lesson.tryThis[1]).toContain('step 8');
    expect(lesson.tryThis[1]).toContain('1,242 words in 9 calls');
  });

  it('try-this 3: read-only cannot refund, approval pauses then a refund runs on Approve, no gate lets 240 out and validation rejects it', () => {
    const f = guardFacts();
    expect(f.readonly.answer).toBe('Could not finish: refund is not offered to this agent.');
    expect(f.waiting.outcome).toBe('paused');
    expect(f.approved.writes).toHaveLength(1);
    expect(f.approved.world.refunds).toEqual([{ order: 1042, amount: 84.5 }]);
    expect(f.openBig.world.refunds).toEqual([{ order: 1043, amount: 240 }]);
    expect(f.validatedBig.world.refunds).toEqual([]);
    expect(lesson.tryThis[2]).toContain('240 goes out');
  });

  it('try-this 4: the naive policy sends one unrequested message; separated, not offered, or the gate leave the outbox empty', () => {
    const f = trustFacts();
    expect(f.naive.world.outbox).toHaveLength(1);
    expect(f.separated.world.outbox).toEqual([]);
    expect(f.withoutTool.world.outbox).toEqual([]);
    expect(f.gated.world.outbox).toEqual([]);
    expect(f.gated.outcome).toBe('paused');
    expect(f.denied.world.outbox).toEqual([]);
    expect(f.naive.writes[0].requested).toBe(false);
    expect(lesson.tryThis[3]).toContain('(1 in the outbox)');
  });
});

describe('captions follow the controls', () => {
  it('the loop caption names the model calls and the outcome for every task and step budget', () => {
    for (const t of LOOP_TASKS) {
      for (const stepBudget of [2, 3, 12, 20]) {
        const run = runAgent(loopConfig(t.id, { stepBudget }));
        const c = expectCaption(loopCaption(t.label, run, run.events.length));
        expect(c).toContain(`${run.steps} model call`);
        expect(c.includes('stopped: step budget reached'), `${t.id} ${stepBudget}`).toBe(run.outcome === 'stopped');
      }
    }
  });

  it('the context caption says the goal was dropped exactly when it was, over budgets and both overflow rules', () => {
    for (const budgetWords of [200, 400, 800, 2000]) {
      for (const overflow of ['truncate', 'summarise'] as const) {
        const cfg = contextConfig({ budgetWords, overflow });
        const run = runAgent(cfg);
        const c = expectCaption(contextCaption(run, cfg, 0));
        expect(c.includes('dropped the goal'), `${budgetWords} ${overflow}`).toBe(run.goalDroppedAtStep !== null);
        expect(c.includes('different question')).toBe(run.answer !== AUDIT_ANSWER && overflow === 'truncate' && run.goalDroppedAtStep !== null);
      }
    }
  });

  it('the guard caption counts the writes that ran, over presets, tasks and approvals', () => {
    for (const preset of Object.keys(GUARD_PRESETS) as (keyof typeof GUARD_PRESETS)[]) {
      for (const t of REFUND_TASKS) {
        for (const approvals of [[], ['approve'], ['deny']] as const) {
          const run = runAgent(guardConfig(t.id, preset, { approvals }));
          const c = expectCaption(guardCaption(run, t.goal));
          expect(c.includes('No write tool ran.'), `${preset} ${t.id} ${approvals}`).toBe(run.writes.length === 0);
        }
      }
    }
  });

  it('the trust caption says the write ran, was stopped or was never attempted, over the whole control cross product', () => {
    for (const trust of ['naive', 'separated'] as const) {
      for (const email of [true, false]) {
        for (const approval of [false, true]) {
          for (const approvals of [[], ['approve'], ['deny']] as const) {
            const run = runAgent(trustConfig({ trust, approval, approvals, offered: email ? TOOLS : ['fetch_page', 'refund'] }));
            const c = expectCaption(trustCaption(run, trust));
            const ran = run.writes.some((w) => !w.requested);
            const attempted = run.events.some((e) => e.phase === 'act' && e.text.startsWith('send_email'));
            expect(c.includes('the write ran'), `${trust} ${email} ${approval} ${approvals}`).toBe(ran);
            expect(c.includes('made no write attempt')).toBe(!attempted);
          }
        }
      }
    }
  });

  it('untrusted observations are labelled in the log rows', () => {
    const run = runAgent(trustConfig());
    const rows = eventRows(run.events);
    expect(rows.some((r) => r.source === 'observe, untrusted' && r.tone === 'orange')).toBe(true);
  });
});

describe('nothing hidden feeds a number', () => {
  it('scenes without a policy control run the separated policy, which cannot differ on their tasks', () => {
    for (const t of LOOP_TASKS) {
      const a = runAgent(loopConfig(t.id, { trust: 'separated' }));
      const b = runAgent(loopConfig(t.id, { trust: 'naive' }));
      expect(b.answer).toBe(a.answer);
      expect(b.processed).toBe(a.processed);
    }
  });

  it('the failure rate and seed do not change a run with no failures to draw', () => {
    const a = runAgent(contextConfig({ seed: 1 }));
    const b = runAgent(contextConfig({ seed: 999 }));
    expect(b.processed).toBe(a.processed);
    expect(b.answer).toBe(a.answer);
  });
});

describe('lesson content', () => {
  it('has four try-this entries, five questions, and passes the content lint', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(unscopedAbsolutes(lesson.keyIdeas.join(' '))).toEqual([]);
    for (const q of lesson.quiz) expect(unscopedAbsolutes(q.why), q.why).toEqual([]);
  });
});
