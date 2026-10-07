import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { fdFrames } from './frames';
import lesson from './index';
import { fdLayout } from './layout';
import { close, open, PRESETS, resolve, run, startWorld } from './model';

describe('fdFrames on every preset', () => {
  for (const p of PRESETS) {
    it(`${p.id}: intro, one true caption per call, then a summary of where every FD points`, () => {
      const start = p.start();
      const played = run(start, p.ops);
      const frames = fdFrames(start, played, 'intro', true);
      expect(frames).toHaveLength(played.length + 2);
      played.forEach((pl, i) => {
        const text = captionText(frames[i + 1].say);
        expect(frames[i + 1].played).toBe(pl);
        if (!pl.result.ok) expect(text).toContain(pl.result.errno);
        else if (pl.result.fd !== undefined && (pl.op.kind === 'open' || pl.op.kind === 'accept' || pl.op.kind === 'dup' || pl.op.kind === 'listen')) expect(text).toContain(String(pl.result.fd));
        if (pl.op.kind === 'finish') expect(text.includes('leaked')).toBe(!pl.op.closes);
        // the scene lays out for every frame
        expect(fdLayout(frames[i + 1].world).height).toBeGreaterThan(0);
      });
      const end = played.at(-1)!.result.world;
      const last = captionText(frames.at(-1)!.say);
      for (const proc of end.procs) {
        proc.fds.forEach((id, fd) => {
          if (id !== null) expect(last).toContain(`${fd} → ${resolve(end, proc.pid, fd)!.obj.name}`);
        });
      }
    });
  }
  it('the sandbox (no summary) has just the intro plus one frame per call', () => {
    const start = startWorld();
    const played = run(start, [{ kind: 'pipe', pid: 100 }]);
    expect(fdFrames(start, played, 'intro', false)).toHaveLength(2);
  });
});

describe('claims in the lesson text', () => {
  it('Q3: with 0, 1, 2 and 5 open, open() returns 3', () => {
    let w = startWorld();
    for (const name of ['a', 'b', 'c']) w = open(w, 100, name, 'r').world;
    w = close(w, 100, 3).world;
    w = close(w, 100, 4).world;
    const r = open(w, 100, 'x', 'r');
    expect(r.ok && r.fd).toBe(Number(lesson.quiz[2].options[lesson.quiz[2].answer]));
  });
  it('try-this: open, open, close 3, open gives 3 again', () => {
    let w = open(startWorld(), 100, 'data.txt', 'rw').world;
    w = open(w, 100, 'data.txt', 'rw').world;
    w = close(w, 100, 3).world;
    const r = open(w, 100, 'data.txt', 'rw');
    expect(r.ok && r.fd).toBe(3);
  });
});
