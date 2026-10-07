import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { introText, streamFrames } from './frames';
import { BROAD_RETURN_RULE, PRESETS, cloneRules, runStream } from './model';

const text = (n: Parameters<typeof captionText>[0]) => {
  const t = captionText(n).replace(/\s+/g, ' ');
  expect(t).not.toMatch(/[a-z)]\.[A-Z]/);
  return t;
};

describe('every caption is true, for every preset × tracking × broad rule', () => {
  for (const preset of PRESETS)
    for (const tracking of [true, false])
      for (const broad of tracking ? [false] : [false, true]) {
        it(`${preset.id}, tracking ${tracking}, broad ${broad}`, () => {
          const rules = cloneRules(preset.rules);
          if (broad) rules.push(BROAD_RETURN_RULE());
          const steps = runStream(rules, preset.packets, tracking, preset.policy);
          const frames = streamFrames(steps, rules, tracking, preset.policy, introText(preset.label, preset.packets.length, tracking));
          for (const f of frames.slice(1)) {
            const s = steps[f.k];
            const say = text(f.say);
            const v = s.verdict;
            if (f.phase === 'check') {
              const o = v!.outcomes[f.rule];
              expect(o).not.toBe('unreached');
              expect(say.startsWith(`Rule ${f.rule + 1} `)).toBe(true);
              expect(say.includes(' matches. First match wins')).toBe(o === 'match');
              if (o === 'pass') expect(say).toContain("doesn't match");
            }
            if (f.phase === 'policy') {
              expect(v!.rule).toBeNull();
              expect(say).toContain(`decides: ${preset.policy}`);
            }
            if (f.phase === 'outcome' && v) expect(say.startsWith(v.action)).toBe(true);
            if (f.phase === 'arrive') {
              expect(say).toContain(s.packet.label);
              if (tracking) expect(say).toContain(`Conntrack calls it ${s.ct}`);
            }
            if (s.packet.dir === 'out') expect(say).toContain(tracking ? 'records the flow' : 'nothing remembers the flow');
          }
          // One check frame per rule actually reached, for every inbound packet.
          steps.forEach((s, k) => {
            if (!s.verdict) return;
            const checks = frames.filter((f) => f.k === k && f.phase === 'check').map((f) => f.rule);
            expect(checks).toEqual(s.verdict.outcomes.map((o, i) => (o === 'unreached' ? -1 : i)).filter((i) => i >= 0));
          });
        });
      }
});
