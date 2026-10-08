import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { cat, closeAll, dfBlocks, duBlocks, link, openFile, resolve, symlink, unlink, type Fs, type OpResult } from './fs';

/** The sandbox works in /docs (inode 12). */
export const DOCS = 12;
export const FILE_INO = 14;

export type Cmd = 'ln' | 'ln-s' | 'rm' | 'cat-n2' | 'cat-s2' | 'cat-notes' | 'open' | 'close';

export const COMMANDS: { id: Cmd; text: string }[] = [
  { id: 'ln', text: 'ln notes.txt n2' },
  { id: 'ln-s', text: 'ln -s notes.txt s2' },
  { id: 'rm', text: 'rm notes.txt' },
  { id: 'cat-notes', text: 'cat notes.txt' },
  { id: 'cat-n2', text: 'cat n2' },
  { id: 'cat-s2', text: 'cat s2' },
  { id: 'open', text: 'exec 3< notes.txt' },
  { id: 'close', text: 'exec 3<&-' },
];

export function runCmd(fs: Fs, cmd: Cmd): OpResult {
  switch (cmd) {
    case 'ln':
      return link(fs, DOCS, 'notes.txt', 'n2');
    case 'ln-s':
      return symlink(fs, DOCS, 'notes.txt', 's2');
    case 'rm':
      return unlink(fs, DOCS, 'notes.txt');
    case 'cat-notes':
      return cat(fs, DOCS, 'notes.txt');
    case 'cat-n2':
      return cat(fs, DOCS, 'n2');
    case 'cat-s2':
      return cat(fs, DOCS, 's2');
    case 'open':
      return fs.open.size > 0 ? { fs, out: [], error: 'fd 3 is already open in this demo' } : openFile(fs, DOCS, 'notes.txt');
    case 'close':
      return closeAll(fs);
  }
}

/** True when `name` in /docs is a symlink whose target no longer resolves. */
export function dangling(fs: Fs, name: string): boolean {
  const own = resolve(fs, name, DOCS, { follow: false });
  if (own.ino === null || fs.inodes.get(own.ino)!.kind !== 'symlink') return false;
  return resolve(fs, name, DOCS).ino === null;
}

/** What one command did, read off the state before and after it. */
export function cmdCaption(before: Fs, after: Fs, cmd: Cmd, res: OpResult): ReactNode {
  if (res.error && cmd === 'cat-s2' && dangling(before, 's2')) {
    return <>The symlink still holds the path <code>notes.txt</code>, but nothing has that name any more: a dangling link. A hard link would still work.</>;
  }
  if (res.error) return <>That failed: <code>{res.error}</code>. Nothing changed.</>;
  if (cmd === 'ln-s' && dangling(after, 's2')) return <>Made symlink <code>s2</code> → <code>notes.txt</code>, but nothing has that name now, so it dangles from the start.</>;
  const node = after.inodes.get(FILE_INO);
  const links = node?.links ?? 0;
  const open = after.open.get(FILE_INO) ?? 0;
  const freed = before.inodes.has(FILE_INO) && !node;
  const df = dfBlocks(after);
  const du = duBlocks(after);
  const gap = df === du ? null : <> <code>df</code> counts {plural(df, 'data block')} in use but <code>du</code> finds only {du}: the difference belongs to a file with no name.</>;
  switch (cmd) {
    case 'ln':
      return <>A hard link is just a second directory entry: <code>n2</code> → inode {FILE_INO}. The inode's link count is now {links}. There is still one copy of the data.</>;
    case 'ln-s':
      return <>A symlink is a new inode of its own whose content is a path, <code>notes.txt</code>. Inode {FILE_INO}'s link count doesn't change ({links}).</>;
    case 'rm':
      if (freed) return <><code>rm</code> removed the entry; inode {FILE_INO} had no other names and no open descriptors, so its inode and blocks were freed.{gap}</>;
      return (
        <>
          <code>rm</code> only removed one name. Inode {FILE_INO} {links > 0 ? <>still has {plural(links, 'link')}</> : <>has no names left but is still open ({plural(open, 'descriptor')})</>}, so its data stays on disk.{gap}
        </>
      );
    case 'open':
      return <>The shell opened <code>notes.txt</code> as fd 3 and keeps it open, like a long-running process writing a log (see <code>file-descriptors</code>).</>;
    case 'close':
      return freed ? (
        <>Closing fd 3 dropped the last reference: inode {FILE_INO} had no names left, so now its blocks are freed and <code>df</code> agrees with <code>du</code> again.</>
      ) : (
        <>fd 3 is closed. Inode {FILE_INO} still has {plural(links, 'link')}, so nothing is freed.</>
      );
    default:
      return <>Printed: <code>{res.out[0]}</code></>;
  }
}
