import { describe, expect, it } from 'vitest';
import { FILE_BYTES, FD_READ_BYTES, forkShare, openingShare, readShared, shareRows } from './share';
import { usesView, DEFAULT_USES, type Preset, type UsesState } from './usesView';
import { MAX_WORKERS } from './uses';
import { frameLook, openingWorld, pageReadout, processRowDecor, pteLook, sharedFrameCount, sharedPages } from './view';

describe('the scene views', () => {
  it('scene 1 opens before the fork (one process, nothing shared) and scene 2 after it (two processes sharing all 8 frames)', () => {
    const a = openingWorld('fork');
    expect([a.alive.length, sharedFrameCount(a), a.copiedPages]).toEqual([1, 0, 0]);
    const b = openingWorld('write');
    expect([b.alive.length, sharedFrameCount(b), b.copiedPages, b.forkedEntries]).toEqual([2, 8, 0, 8]);
  });

  it('page table entries: outlined info while read-only COW, tinted once writable, green for a copied frame, dim when unmapped', () => {
    const m = openingWorld('write');
    expect(pteLook(m, 1, 0)).toMatchObject({ tone: 'info', fill: 'outline', text: 'f0' });
    m.write(2, 0, 0x41);
    expect(pteLook(m, 2, 0)).toMatchObject({ tone: 'ok', fill: 'tint' });
    expect(pteLook(m, 1, 0)).toMatchObject({ tone: 'info', fill: 'outline' });
    m.write(1, 0, 0x42);
    expect(pteLook(m, 1, 0)).toMatchObject({ tone: 'muted', fill: 'tint' });
    m.exec(2);
    expect(pteLook(m, 2, 5)).toMatchObject({ tone: 'dim', fill: 'outline', text: '' });
  });

  it('frames: violet with the count while shared, green when a private copy, dim when free', () => {
    const m = openingWorld('write');
    expect(frameLook(m, 0)).toEqual({ text: '2', tone: 'violet', fill: 'tint' });
    expect(frameLook(m, 8)).toMatchObject({ tone: 'dim', text: '' });
    m.write(2, 0, 1);
    const copy = m.proc(2).table[0].frame!;
    expect(frameLook(m, copy)).toMatchObject({ tone: 'ok', text: '1' });
    expect(frameLook(m, 0)).toMatchObject({ tone: 'muted', text: '1' });
    m.exit(2);
    expect(frameLook(m, copy)).toMatchObject({ tone: 'dim' });
  });

  it('the process row rail counts shared pages and disappears when nothing is shared', () => {
    const m = openingWorld('write');
    const decor = processRowDecor(m, [1, 2]);
    expect(decor(0)).toEqual({ tone: 'violet', label: '8 shared' });
    for (let p = 0; p < 3; p++) m.write(2, p, 1);
    expect(sharedPages(m, 1)).toBe(5);
    expect(processRowDecor(m, [1, 2])(0)).toEqual({ tone: 'violet', label: '5 shared' });
    m.exit(2);
    expect(processRowDecor(m, [1])(0)).toBeNull();
  });

  it('the page readout shows each process\'s own byte after a write, and neither sees the other\'s write', () => {
    const m = openingWorld('write');
    m.write(2, 4, 0x41);
    const rows = pageReadout(m, 4);
    expect(rows.map((r) => [r.pid, r.byte])).toEqual([[1, 0x10 + 4 * 0x11], [2, 0x41]]);
    expect(rows[0].refs).toBe(1);
  });
});

describe('scene 3: only the controls a preset shows reach its numbers', () => {
  const presets: Preset[] = ['snapshot', 'prefork', 'exec'];
  const variants = (s: UsesState): UsesState[] => [
    { ...s, huge: !s.huge },
    { ...s, snapshotWrites: s.snapshotWrites + 100 },
    { ...s, workers: s.workers === MAX_WORKERS ? 1 : s.workers + 1 },
    { ...s, workerWrites: s.workerWrites + 3 },
  ];
  const relevant: Record<Preset, (keyof UsesState)[]> = { snapshot: ['huge', 'snapshotWrites'], prefork: ['workers', 'workerWrites'], exec: [] };

  it('changing a control a preset does not show leaves its stats, bars and caption exactly as they were', () => {
    for (const preset of presets) {
      const base = usesView({ ...DEFAULT_USES, preset });
      for (const v of variants({ ...DEFAULT_USES, preset })) {
        const changed = (Object.keys(v) as (keyof UsesState)[]).filter((k) => v[k] !== DEFAULT_USES[k] && k !== 'preset');
        if (changed.some((k) => relevant[preset].includes(k))) continue;
        expect(usesView(v), `${preset} ${changed.join(',')}`).toEqual(base);
      }
    }
  });

  it('the snapshot caption and stats quote the run, and huge pages copy 512 times as much per write', () => {
    const small = usesView({ ...DEFAULT_USES, snapshotWrites: 1 });
    const huge = usesView({ ...DEFAULT_USES, snapshotWrites: 1, huge: true });
    expect(small.stats[0].value).toBe('1');
    expect(small.stats[2]).toMatchObject({ value: '4.0 KB' });
    expect(huge.stats[2]).toMatchObject({ value: '2.0 MB', sub: '512x a 4 KB page' });
    expect(huge.caption).toContain('memory grew by 2.0 MB');
  });
});

describe('scene 4: what fork does not share', () => {
  it('fork returns the child pid in the parent and 0 in the child; the child has one thread of the parent\'s three', () => {
    const s = forkShare(openingShare(), 1);
    const rows = Object.fromEntries(shareRows(s).map((r) => [r.thing, r]));
    expect([rows['fork() returned'].parent, rows['fork() returned'].child]).toEqual(['2', '0']);
    expect([rows['threads that exist'].parent, rows['threads that exist'].child]).toEqual(['3', '1']);
    expect(rows['file descriptor 3'].verdict).toBe('shared');
  });

  it('before the fork there is no child and no return value', () => {
    const rows = shareRows(openingShare());
    expect(rows[0]).toMatchObject({ parent: 'not called yet', child: '(no child yet)' });
  });

  it('a read by one process moves the offset for both: parent reads 4, child then reads bytes 4 to 8', () => {
    let s = forkShare(openingShare(), 1);
    s = readShared(s, 1)!;
    s = readShared(s, 2)!;
    expect(s.reads).toEqual([{ pid: 1, from: 0, to: FD_READ_BYTES }, { pid: 2, from: FD_READ_BYTES, to: 2 * FD_READ_BYTES }]);
    expect(shareRows(s).find((r) => r.thing === 'file descriptor 3')).toMatchObject({ parent: 'offset 8', child: 'offset 8' });
  });

  it('a read at the end of the file is refused, and forking never changes the shared offset', () => {
    let s = openingShare();
    for (let i = 0; i < FILE_BYTES / FD_READ_BYTES; i++) s = readShared(s, 1)!;
    expect(readShared(s, 1)).toBeNull();
    expect(forkShare(s, 1).offset).toBe(FILE_BYTES);
  });
});
