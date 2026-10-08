import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { applyFrames, planCaption } from './frames';
import lesson from './index';
import { apply, plan, planCounts } from './model';
import { parseConfig } from './parse';
import { baselineWorld, SCENARIOS } from './scenarios';
import { destroyed, planLines, resourceGraph } from './view';

const setup = (id: (typeof SCENARIOS)[number]['id']) => {
  const s = SCENARIOS.find((x) => x.id === id)!;
  const parsed = parseConfig(s.text);
  if (!parsed.ok) throw new Error(parsed.message);
  const world = s.world();
  return { config: parsed.config, world, p: plan(parsed.config, world) };
};

describe('planLines', () => {
  it('rename: one replacement line, with the attribute that forces it', () => {
    const lines = planLines(setup('rename').p).map((l) => l.text);
    expect(lines).toEqual([
      '-/+ vm.web2 must be replaced',
      '      ~ name: "web-2" -> "api-1"  # forces replacement',
      'Plan: 1 to add, 0 to change, 1 to destroy. 4 unchanged.',
    ]);
  });

  it('tag and drift are updates in place; drift is reported before the change', () => {
    expect(planLines(setup('tag').p).map((l) => l.text)).toContain('      ~ tags.env: "prod" -> "staging"');
    const drift = planLines(setup('drift').p);
    expect(drift[0]).toEqual({ text: '# vm.web1: size was "small" in the state, but is "large" in the cloud', tone: 'orange' });
    expect(drift.map((l) => l.text)).toContain('      ~ size: "large" -> "small"');
  });

  it('a cascade shows the dependency as the cause, with the new id unknown', () => {
    const lines = planLines(setup('cidr').p).map((l) => l.text);
    expect(lines).toContain('      ~ network: "net-1001" -> (known after apply)  # points at something being re-created');
    expect(lines).toContain('      ~ target: "vm-1002" -> (known after apply)  # points at something being re-created');
  });

  it('an empty plan says so, and the totals line agrees with planCounts', () => {
    const { config, world } = setup('fresh');
    const done = apply(config, world, plan(config, world)).final;
    expect(planLines(plan(config, done)).map((l) => l.text)).toEqual(['No changes. The config, the state and the cloud already agree.']);
    for (const s of SCENARIOS) {
      const { p } = setup(s.id);
      const n = planCounts(p);
      expect(planLines(p).at(-1)!.text).toContain(`Plan: ${n.add} to add, ${n.change} to change, ${n.destroy} to destroy.`);
    }
  });

  it('destroyed lists replacements and destroys only', () => {
    expect(destroyed(setup('delete').p)).toEqual(['bucket.assets']);
    expect(destroyed(setup('cidr').p)).toEqual(['network.main', 'vm.web1', 'vm.web2']);
    expect(destroyed(setup('tag').p)).toEqual([]);
  });
});

describe('resourceGraph', () => {
  it('draws an edge from each dependency to its dependent, and keeps destroyed resources', () => {
    const { config, world } = setup('delete');
    const g = resourceGraph(config, world);
    expect(g.nodes.map((n) => n.id)).toContain('bucket.assets');
    expect(g.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['network.main>vm.web1', 'network.main>vm.web2', 'vm.web1>dns_record.www']);
    const shrunk = resourceGraph([], baselineWorld());
    expect(shrunk.edges.map((e) => `${e.from}>${e.to}`)).toContain('vm.web1>dns_record.www');
  });
});

describe('captions', () => {
  it('every preset: the plan caption and every apply frame are glue-free and agree with the model', () => {
    for (const s of SCENARIOS) {
      const { config, world, p } = setup(s.id);
      const text = expectCaption(planCaption(p));
      expect(text.includes('differences') || text.includes('difference')).toBe(p.drift.length + p.gone.length > 0);
      const run = apply(config, world, p);
      const frames = applyFrames(world, run);
      expect(frames).toHaveLength(run.steps.length + 2);
      frames.forEach((f, i) => {
        const caption = expectCaption(f.say);
        if (i === 0 || i > run.steps.length) return;
        const r = run.results[i - 1];
        expect(caption).toContain(r.step.address);
        expect(caption.includes('Failed')).toBe(r.status === 'failed');
        expect(caption.includes('skipped')).toBe(r.status === 'skipped');
      });
      const last = expectCaption(frames.at(-1)!.say);
      expect(last.startsWith('Apply complete')).toBe(run.results.every((r) => r.status === 'ok'));
    }
  });

  it('the world in each frame is the world after that many steps', () => {
    const { config, world, p } = setup('cidr');
    const run = apply(config, world, p);
    const frames = applyFrames(world, run);
    expect(frames[0].world).toBe(world);
    frames.slice(1, -1).forEach((f, i) => expect(f.world).toBe(run.snapshots[i]));
    expect(frames.at(-1)!.world).toBe(run.final);
  });
});

describe('lesson text', () => {
  it('the quiz answers its own claims: a rename is a replacement and a tag is an in-place update', () => {
    expect(setup('rename').p.changes.find((c) => c.address === 'vm.web2')!.action).toBe('replace');
    expect(setup('tag').p.changes.find((c) => c.address === 'vm.web1')!.action).toBe('update');
    expect(lesson.quiz[4].options[lesson.quiz[4].answer]).toContain('update back');
  });
});
