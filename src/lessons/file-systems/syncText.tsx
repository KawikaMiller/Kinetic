import type { ReactNode } from 'react';
import { afterPowerCut, DIR_SYNC_MS, durableAt, FILE_SYNC_MS, FLUSH_MS, type SyncConfig } from './crash';

/** Where the power can go, ms after write() returned. */
export const CUT_STOPS = [2, 6, 12, 20, 500, 4990, 5010] as const;

export const msLabel = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(t % 1000 === 0 ? 0 : 2)} s` : `${t} ms`);

export interface SyncEvent {
  label: string;
  at: number;
}

/** The app's calls and the kernel's flush, in time order. */
export function syncEvents(c: SyncConfig): SyncEvent[] {
  const d = durableAt(c);
  const ev: SyncEvent[] = [{ label: 'write() returns: data is in the page cache', at: 0 }];
  if (c.fsyncFile) ev.push({ label: 'fsync(fd) returns: file data and inode on disk', at: d.data });
  if (c.fsyncDir && c.newFile) ev.push({ label: 'fsync(dir fd) returns: the new name is on disk', at: d.entry });
  if (c.fsyncDir && !c.newFile) ev.push({ label: 'fsync(dir fd) returns: nothing new to write there', at: (c.fsyncFile ? FILE_SYNC_MS : 0) + DIR_SYNC_MS });
  ev.push({ label: 'background writeback, shown at 5 s (illustrative; without fsync nothing is promised)', at: FLUSH_MS });
  return ev.sort((a, b) => a.at - b.at);
}

export function syncCaption(c: SyncConfig, t: number): ReactNode {
  const o = afterPowerCut(c, t);
  const d = durableAt(c);
  const lead = <>Power cut {msLabel(t)} after <code>write()</code> returned. </>;
  if (o === 'safe') {
    return (
      <>
        {lead}
        <span className="hl ok">Safe:</span> the data reached the disk at {msLabel(d.data)}
        {c.newFile ? <> and the new name at {msLabel(d.entry)}</> : null}, both before the cut.
      </>
    );
  }
  if (o === 'file-missing') {
    return (
      <>
        {lead}
        <span className="hl orange">The file is gone after the reboot:</span> its directory entry was still only in memory
        {c.fsyncDir ? (
          <>: fsync(dir fd) was called but hadn't returned yet (it's done at {msLabel(d.entry)})</>
        ) : c.fsyncFile && t >= d.data ? (
          <>, even though fsync on the file had already put the data on disk. A new file needs fsync on its directory too</>
        ) : null}
        .
      </>
    );
  }
  return (
    <>
      {lead}
      <span className="hl orange">The write is lost:</span> <code>write()</code> only copied it into the page cache, and {c.fsyncFile ? 'fsync' : 'background writeback'} hadn't
      put it on disk yet{c.newFile ? <> (the file exists, but without the new data)</> : null}.
    </>
  );
}
