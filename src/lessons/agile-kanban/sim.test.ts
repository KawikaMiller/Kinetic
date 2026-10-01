import { describe, expect, it } from 'vitest';
import {
  advance, BLOCK_DAYS, blockCard, createWorld, efficiency, inFlight, inStage, isBlocked, measureLittle, setProcess, sharePerCard, sprintBacklog,
  SPRINT_COMMIT, SPRINT_DAYS, stats, UNLIMITED, WINDOW_DAYS, WORKERS,
} from './sim';

const DT = 0.05;
const run = (w: ReturnType<typeof createWorld>, days: number, each?: () => void) => {
  const end = w.t + days;
  while (w.t < end - 1e-9) {
    advance(w, DT);
    each?.();
  }
};

describe('capacity model', () => {
  it('loses capacity as people juggle more cards', () => {
    expect(efficiency(1)).toBe(1);
    expect(efficiency(0.5)).toBe(1);
    expect(efficiency(2)).toBeCloseTo(1 / 1.2, 12);
    expect(efficiency(5)).toBeLessThan(efficiency(2));
  });

  it('never gives one card more than one person', () => {
    expect(sharePerCard(1, WORKERS)).toBe(1);
    expect(sharePerCard(0, WORKERS)).toBe(0);
    expect(sharePerCard(6, 3)).toBeCloseTo((3 * efficiency(2)) / 6, 12);
  });

  it('makes total output fall once WIP passes the team size', () => {
    const total = (k: number) => sharePerCard(k, WORKERS) * k;
    expect(total(3)).toBe(3);
    expect(total(6)).toBeLessThan(total(3));
    expect(total(12)).toBeLessThan(total(6));
  });
});

describe('flow bookkeeping', () => {
  it('conserves cards: arrived = backlog + in progress + review + done', () => {
    const w = createWorld({ seed: 3, wipLimit: 4 });
    run(w, 200, () => {
      const c = w.counts;
      expect(c.arrived).toBe(inStage(w, 'backlog').length + inStage(w, 'dev').length + inStage(w, 'review').length + c.done);
      expect(c.started).toBeGreaterThanOrEqual(c.reviewing);
      expect(c.reviewing).toBeGreaterThanOrEqual(c.done);
    });
  });

  it('never has more cards In progress than the WIP limit', () => {
    for (const limit of [1, 2, 4, 7]) {
      const w = createWorld({ seed: limit, wipLimit: limit });
      run(w, 150, () => expect(inStage(w, 'dev').length).toBeLessThanOrEqual(limit));
    }
  });

  it('is deterministic for a seed', () => {
    const a = createWorld({ seed: 11 });
    const b = createWorld({ seed: 11 });
    run(a, 80);
    run(b, 80);
    expect(a.counts).toEqual(b.counts);
  });
});

describe("Little's law", () => {
  it('average WIP ÷ throughput is within 10% of the measured average cycle time', () => {
    for (const [seed, wipLimit] of [[1, 2], [2, 3], [3, 4], [4, 6]]) {
      const m = measureLittle({ seed, wipLimit, days: 3000, warmup: 300 });
      expect(Math.abs(m.little - m.cycle) / m.cycle).toBeLessThan(0.1);
    }
  });

  it('agrees with the live stats readout once the window is full', () => {
    const w = createWorld({ seed: 5, wipLimit: 3 });
    run(w, 400);
    const s = stats(w);
    expect(s.span).toBeCloseTo(WINDOW_DAYS, 0);
    expect(s.littleCycle).toBeGreaterThan(0);
  });
});

describe('starting more work does not finish more work', () => {
  it('unlimited WIP: throughput no higher, cycle time far longer', () => {
    const limited = measureLittle({ seed: 9, wipLimit: 3, days: 600, warmup: 100 });
    const unlimited = measureLittle({ seed: 9, wipLimit: UNLIMITED, days: 600, warmup: 100 });
    expect(unlimited.throughput).toBeLessThanOrEqual(limited.throughput * 1.02);
    expect(unlimited.cycle).toBeGreaterThan(limited.cycle * 2);
    expect(unlimited.wip).toBeGreaterThan(limited.wip * 2);
  });
});

describe('scrum', () => {
  it('commits cards to the sprint only at planning, never more than the sprint commitment', () => {
    const w = createWorld({ seed: 2, process: 'scrum' });
    setProcess(w, 'scrum');
    const committedIds = () => new Set(w.cards.filter((c) => c.committed).map((c) => c.id));
    let before = committedIds();
    run(w, SPRINT_DAYS * 6, () => {
      const now = committedIds();
      const added = [...now].filter((id) => !before.has(id));
      if (added.length) {
        const offset = w.t % SPRINT_DAYS;
        expect(Math.min(offset, SPRINT_DAYS - offset)).toBeLessThan(DT * 1.5); // only at planning
        expect(sprintBacklog(w) + inFlight(w)).toBeLessThanOrEqual(SPRINT_COMMIT);
      }
      expect(inStage(w, 'dev').length).toBeLessThanOrEqual(WORKERS); // one card per developer
      for (const c of inStage(w, 'dev')) expect(c.committed).toBe(true); // nothing starts outside the sprint
      before = now;
    });
    expect(w.sprints.length).toBeGreaterThanOrEqual(5);
    expect(w.sprints.reduce((s, x) => s + x.demoed, 0)).toBeLessThanOrEqual(w.counts.done);
  });

  it('makes requests wait for the next planning: longer lead time than kanban for the same team', () => {
    const lead = (process: 'kanban' | 'scrum') => {
      const w = createWorld({ seed: 6, wipLimit: WORKERS, process });
      setProcess(w, process);
      run(w, 400);
      return stats(w).lead;
    };
    expect(lead('scrum')).toBeGreaterThan(lead('kanban'));
  });
});

describe('blocked cards', () => {
  it('stop progressing but keep their WIP slot, then resume', () => {
    const w = createWorld({ seed: 4, wipLimit: 2 });
    run(w, 1);
    const c = blockCard(w)!;
    expect(c).toBeTruthy();
    const left = c.devLeft;
    run(w, BLOCK_DAYS - 0.5, () => {
      expect(c.devLeft).toBe(left);
      expect(inStage(w, 'dev')).toContain(c);
    });
    expect(isBlocked(c, w.t)).toBe(true);
    run(w, 1);
    expect(isBlocked(c, w.t)).toBe(false);
    expect(c.devLeft).toBeLessThan(left);
  });
});
