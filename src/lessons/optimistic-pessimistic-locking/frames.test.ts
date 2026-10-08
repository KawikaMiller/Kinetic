import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { buildHttpFrames, changeCaption, httpTone, introCaption } from './frames';
import { LUNCH_TICKS, STRATEGIES, START, finished, httpScript, lostUpdates, orderings, run, type Opts, type UserId, type World } from './model';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n).replace(/\s+/g, ' ');
const intro = introCaption('x');

const OPTS: Opts[] = [3, 5, 12].flatMap((lockTimeout) => [1, LUNCH_TICKS].map((ana) => ({ editTicks: { ana, ben: 1 }, lockTimeout })));

describe('lane captions are true after every click, in every combination', () => {
  for (const { id } of STRATEGIES)
    it(`${id}: all 20 orderings × lunch × timeout, every prefix`, () => {
      for (const opts of OPTS)
        for (const o of orderings()) {
          let prev: World | null = null;
          for (let k = 1; k <= o.length; k++) {
            const next = run(id, opts, o.slice(0, k));
            const t = text(changeCaption(prev, next, intro));
            expect(t).not.toMatch(/undefined|NaN|\[object/);
            if (finished(next)) {
              expect(t).toContain(`Final stock ${next.row.stock}`);
              expect(t.includes('lost'), `${id} ${o.slice(0, k).join(',')}`).toBe(lostUpdates(next) > 0);
            } else expect(t).not.toContain('Final stock');
            // A lost update is only ever claimed where the model recorded a clobbering save.
            expect(t.includes('a lost update')).toBe(next.events.slice(prev?.events.length ?? 0).some((e) => e.kind === 'save' && e.clobbered));
            // Blocking is only claimed where a user is really waiting.
            if (t.includes('blocks:')) expect([next.users.ana.waitingSince, next.users.ben.waitingSince].some((x) => x !== null)).toBe(true);
            prev = next;
          }
        }
    });
  it('the empty world shows the intro', () => {
    expect(changeCaption(null, run('none', OPTS[0], []), intro)).toBe(intro);
  });
  it('the headline cases read right', () => {
    const both: UserId[] = ['ana', 'ben', 'ana', 'ben', 'ana', 'ben'];
    expect(text(changeCaption(null, run('none', OPTS[0], both), intro))).toContain(`Final stock 9: 2 sales were saved but only 1 counted, so 1 decrement was lost.`);
    expect(text(changeCaption(null, run('optimistic', OPTS[0], both, true), intro))).toContain('matches 0 rows');
    const lunch = run('pessimistic', { editTicks: { ana: LUNCH_TICKS, ben: 1 }, lockTimeout: 5 }, ['ana', 'ben', 'ana', 'ana', 'ben', 'ben'], true);
    expect(text(changeCaption(null, lunch, intro))).toContain('Ben timed out waiting');
    expect(text(changeCaption(null, lunch, intro))).toContain('lock wait timeout exceeded');
  });
});

describe('HTTP captions, for every combination', () => {
  for (const require of [true, false])
    for (const sends of [true, false])
      it(`server requires ${require}, Ben sends If-Match ${sends}`, () => {
        const steps = httpScript(require, sends);
        const frames = buildHttpFrames(steps, 'intro');
        expect(frames).toHaveLength(steps.length + 2);
        const say = frames.slice(1).map((f) => text(f.say));
        const all = say.join(' | ');
        const end = say[say.length - 1];
        const blind = !require && !sends;
        expect(all.includes('412 Precondition Failed')).toBe(sends);
        expect(all.includes('428 Precondition Required')).toBe(!sends && require);
        expect(all.includes('the write was stale')).toBe(blind);
        expect(end).toContain(`stock ${steps[steps.length - 1].product.stock}`);
        expect(end.includes('One sale was lost')).toBe(blind);
        expect(steps[steps.length - 1].product.stock).toBe(blind ? START.stock - 1 : START.stock - 2);
      });
  it('refusals are orange, a stale overwrite red, successes green', () => {
    const tones = (r: boolean, s: boolean) => httpScript(r, s).filter((x) => x.from === 'api' && x.kind === 'result').map(httpTone);
    expect(tones(false, true)).toEqual(['ok', 'orange', 'ok']);
    expect(tones(true, false)).toEqual(['ok', 'orange', 'ok']);
    expect(tones(false, false)).toEqual(['ok', 'bad']);
  });
});
