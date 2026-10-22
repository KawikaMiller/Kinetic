import { describe, expect, it } from 'vitest';
import { humanDuration } from '../../core/format';
import lesson from './index';
import { sagaScene, sagaSteps } from './sagaSteps';
import { NO_KEY_SEED } from './sagaCheck';
import { CLIENT2_AFTER_MS, SCENE_DOWN_MS, type TwoPcMsg } from './twoPc';
import { CHECK_SEEDS, checkSeeds, EARLY_COMMIT_SEED } from './twoPcCheck';
import { sceneOptions, stallText, twoPcSteps } from './twoPcSteps';

const payloadType = (s: { row: { payload?: unknown } | null }) => (s.row?.payload as TwoPcMsg | undefined)?.type;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: a clean yes-vote run has 3 PREPARE, 3 YES, one COMMIT decision, 3 COMMIT, 3 acks; locks climb to 3 and fall to 0', () => {
    const steps = twoPcSteps(sceneOptions('happy', 1, 'real', false));
    const delivered = (type: string) => steps.filter((s) => s.row?.kind === 'deliver' && payloadType(s) === type).length;
    // Duplicates are off, so each message is delivered once; a frame can be folded away only if it showed nothing new.
    expect(delivered('prepare')).toBe(3);
    expect(delivered('vote')).toBeGreaterThanOrEqual(1);
    expect(Math.max(...steps.map((s) => s.locks))).toBe(3);
    expect(steps.at(-1)?.locks).toBe(0);
    expect(steps.at(-1)?.facts.decision).toBe('commit');
    expect(steps.at(-1)?.consistency.label).toBe('consistent ✓ all committed');
    expect(steps[0].sent).toBe(0);
    expect(steps.at(-1)?.sent).toBe(14);
  });

  it('try-this 2: a crash before deciding blocks for about 30 s at Customer #2\'s request and 2 min at the restart, then aborts', () => {
    const o = sceneOptions('crash-before', 1, 'real', false);
    const steps = twoPcSteps(o);
    const crash = steps.find((s) => s.row?.kind === 'crash')!;
    expect(crash.locks, 'the YES voters keep their locks').toBeGreaterThanOrEqual(1);
    expect(crash.facts.decision, 'nothing was decided').toBeNull();
    const ask = steps.find((s) => payloadType(s) === 'reserve')!;
    expect(ask.stallMs).toBeGreaterThanOrEqual(CLIENT2_AFTER_MS);
    expect(ask.stallMs).toBeLessThan(CLIENT2_AFTER_MS + 1_000);
    expect(stallText(ask.stallMs)).toBe('30 s');
    const restart = steps.find((s) => s.row?.kind === 'restart')!;
    expect(stallText(restart.stallMs)).toBe(humanDuration(SCENE_DOWN_MS / 1000));
    expect(humanDuration(SCENE_DOWN_MS / 1000)).toBe('2 min');
    const last = steps.at(-1)!;
    expect(last.facts.decision).toBe('abort');
    expect(last.consistency.label).toBe('consistent ✓ nothing happened');
    expect(last.nodes.client2.detail).toBe('got the lock, proceeds');
  });

  it('try-this 3: 2PC with a NO vote never charges; the failing saga charges, shows "charged, can\'t ship", then refunds and says for how long', () => {
    const no = twoPcSteps(sceneOptions('no', 1, 'real', false));
    expect(no.every((s) => s.nodes.payments.status !== 'committed')).toBe(true);
    expect(no.at(-1)?.nodes.payments.status).toBe('aborted');
    const saga = sagaSteps(sagaScene('fail', 'orch', 1, 'idempotent', false));
    expect(saga.some((s) => s.nodes.payments.status === 'committed')).toBe(true);
    expect(saga.some((s) => s.consistency.label === "inconsistent: charged, can't ship")).toBe(true);
    expect(saga.at(-1)?.nodes.payments.status).toBe('↺ compensated');
    expect(saga.at(-1)?.consistency.label).toBe('consistent ✓ after compensation');
    expect(Number(saga.at(-1)?.facts.inconsistentMs)).toBeGreaterThan(0);
  });

  it(`try-this 4: "Commit after 2 YES votes" on seed ${EARLY_COMMIT_SEED} breaks atomicity; the real protocol on the same seed and network does not`, () => {
    const broken = twoPcSteps(sceneOptions('no', EARLY_COMMIT_SEED, 'early-commit', true));
    expect(broken.some((s) => s.violation?.includes('payments committed but inventory aborted'))).toBe(true);
    expect(broken.at(-1)?.consistency.label).toBe('ATOMICITY BROKEN');
    const real = twoPcSteps(sceneOptions('no', EARLY_COMMIT_SEED, 'real', true));
    expect(real.every((s) => s.violation === null)).toBe(true);
    const check = checkSeeds('early-commit');
    expect(check.failedSeeds).toBeGreaterThan(0);
    expect(check.seeds).toBe(CHECK_SEEDS);
  });

  it(`try-this 5: "No idempotency key" on seed ${NO_KEY_SEED.orch} charges twice; the real saga on the same seed and network does not`, () => {
    const broken = sagaSteps(sagaScene('fail', 'orch', NO_KEY_SEED.orch, 'no-key', true));
    expect(broken.some((s) => s.violation?.includes('charged $80 for a $40 order'))).toBe(true);
    const real = sagaSteps(sagaScene('fail', 'orch', NO_KEY_SEED.orch, 'idempotent', true));
    expect(real.every((s) => s.violation === null)).toBe(true);
  });
});

describe('the lesson text', () => {
  it('has five try-this entries and five quiz questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });

  it('scopes the saga claim: no locks across services, isolation given up', () => {
    expect(lesson.summary.what).toContain('gives up isolation');
    expect(lesson.summary.what).not.toContain('lock-free');
  });
});
