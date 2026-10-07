import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { afterPowerCut, crashPoints, durableAt, writeSequence, type Mode, type NoJournalOrder } from './crash';
import { crashCaption, PROBLEM_TEXT } from './crashText';
import { walkFrames } from './frames';
import { dfBlocks, duBlocks, initialFs, resolve, ROOT_INO } from './fs';
import { cmdCaption, COMMANDS, dangling, runCmd, type Cmd } from './links';
import { CUT_STOPS, msLabel, syncCaption, syncEvents } from './syncText';

describe('path walk frames', () => {
  for (const path of ['/docs/notes.txt', '/etc/hosts', '/docs/draft.txt']) {
    it(`${path}: one frame per step, and the summary counts come from the walk`, () => {
      const fs = initialFs();
      const r = resolve(fs, path, ROOT_INO, { readData: true });
      const frames = walkFrames(fs, path, r);
      expect(frames).toHaveLength(r.steps.length + 1);
      frames.slice(0, -1).forEach((f, i) => expect(f.upto).toBe(i + 1));
      const last = captionText(frames.at(-1)!.say);
      expect(last).toContain(`${r.steps.length} block reads`);
      expect(last.includes('failed')).toBe(r.error !== null);
      r.steps.forEach((s, i) => {
        const text = captionText(frames[i].say);
        if (s.kind === 'dir') expect(text.includes("isn't there")).toBe(s.found === null);
        if (s.kind === 'inode' && i > 0) expect(text).toContain(`inode ${s.ino} from inode-table block ${s.block}`);
      });
    });
  }
});

describe('links sandbox captions', () => {
  it('match the state after every command, over every sequence of three commands', () => {
    const ids = COMMANDS.map((c) => c.id);
    for (const a of ids) {
      for (const b of ids) {
        for (const c of ids) {
          let fs = initialFs();
          for (const cmd of [a, b, c] as Cmd[]) {
            const before = fs;
            const res = runCmd(fs, cmd);
            fs = res.fs;
            const text = captionText(cmdCaption(before, fs, cmd, res));
            const node = fs.inodes.get(14);
            if (res.error && !(cmd === 'cat-s2' && dangling(before, 's2'))) expect(text).toContain('Nothing changed');
            if (cmd === 'ln' && !res.error) expect(text).toContain(`link count is now ${node!.links}`);
            if (cmd === 'rm' && !res.error) expect(text.includes('were freed')).toBe(!node);
            if (cmd === 'close' && !res.error) expect(text.includes('now its blocks are freed')).toBe(before.inodes.has(14) && !node);
            if (cmd === 'rm' && !res.error) expect(text.includes('belongs to a file with no name')).toBe(dfBlocks(fs) !== duBlocks(fs));
          }
        }
      }
    }
  });
});

const COMBOS: [Mode, NoJournalOrder][] = [
  ['none', 'DIB'], ['none', 'BID'], ['none', 'IDB'], ['journal', 'DIB'], ['ordered', 'DIB'], ['writeback', 'DIB'],
];

describe('crash captions, every mode × order × crash point', () => {
  for (const [mode, order] of COMBOS) {
    it(`${mode} ${order}`, () => {
      const total = writeSequence(mode, order).length;
      for (const p of crashPoints(mode, order)) {
        const text = captionText(crashCaption(mode, p, total));
        expect(text.includes('Survived:')).toBe(p.outcome.complete);
        expect(text.includes('is lost, but the file system is consistent')).toBe(!p.outcome.complete && p.outcome.problems.length === 0);
        for (const [k, v] of Object.entries(PROBLEM_TEXT)) expect(text.includes(v)).toBe(p.outcome.problems.includes(k as never));
        if (mode !== 'none') expect(text.includes('replays')).toBe(p.before.committed);
      }
    });
  }
});

describe('fsync captions and timeline, every toggle × cut', () => {
  it('say safe, lost or missing exactly as the model decides', () => {
    for (const newFile of [false, true]) {
      for (const fsyncFile of [false, true]) {
        for (const fsyncDir of [false, true]) {
          const c = { newFile, fsyncFile, fsyncDir };
          const ev = syncEvents(c);
          for (let i = 1; i < ev.length; i++) expect(ev[i].at).toBeGreaterThanOrEqual(ev[i - 1].at);
          for (const t of CUT_STOPS) {
            const o = afterPowerCut(c, t);
            const text = captionText(syncCaption(c, t));
            expect(text.includes('Safe:')).toBe(o === 'safe');
            expect(text.includes('The write is lost')).toBe(o === 'data-lost');
            expect(text.includes('The file is gone')).toBe(o === 'file-missing');
            expect(text).toContain(`Power cut ${msLabel(t)}`);
            if (o === 'safe') expect(text).toContain(msLabel(durableAt(c).data));
          }
        }
      }
    }
  });
});
