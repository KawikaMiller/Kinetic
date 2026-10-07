import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { BITMAP_BLOCK, INODE_TABLE, ROOT_INO, SUPERBLOCK, type Fs, type Resolution, type WalkStep } from './fs';

export interface WalkFrame extends Frame {
  /** Steps done so far (steps[0..upto-1]); the last one is "now". */
  upto: number;
}

/** A name for an inode, from the tree: "/" for the root, else the first name that points at it. */
export function nameOf(f: Fs, ino: number): string {
  if (ino === ROOT_INO) return '/';
  for (const entries of f.dirs.values()) {
    const e = entries.find((x) => x.ino === ino);
    if (e) return e.name;
  }
  return `#${ino}`;
}

export function blockRole(block: number): string {
  if (block === SUPERBLOCK) return 'superblock';
  if (block === BITMAP_BLOCK) return 'block bitmap';
  if ((INODE_TABLE as readonly number[]).includes(block)) return 'inode table';
  return 'data block';
}

function stepCaption(f: Fs, s: WalkStep, i: number): ReactNode {
  switch (s.kind) {
    case 'inode': {
      const node = f.inodes.get(s.ino)!;
      if (i === 0) {
        return (
          <>
            Start at the root directory: it is always inode {ROOT_INO}. Read block {s.block} of the inode table to get it: a directory, with its entries in data block {node.blocks[0]}.
          </>
        );
      }
      return (
        <>
          Read inode {s.ino} from inode-table block {s.block}: a {node.kind === 'dir' ? 'directory' : node.kind}, {plural(node.size, 'byte')},{' '}
          {node.blocks.length ? <>data in block{node.blocks.length > 1 ? 's' : ''} {node.blocks.join(' and ')}</> : <>no data blocks</>}. The inode has no name field: the name
          lives only in the directory that points here.
        </>
      );
    }
    case 'dir':
      return s.found === null ? (
        <>
          Read the directory's data, block {s.block}, and look for <code>{s.name}</code>. <span className="hl bad">It isn't there: No such file or directory (ENOENT).</span>
        </>
      ) : (
        <>
          Read the directory's data, block {s.block}: a list of name → inode pairs. <code>{s.name}</code> → inode {s.found}.
        </>
      );
    case 'symlink':
      return <>Inode {s.ino} is a symlink holding the path <code>{s.target}</code>: start the lookup again from there.</>;
    case 'data':
      return <>Follow the inode's block pointer to data block {s.block} and read the bytes.</>;
  }
}

export function walkFrames(f: Fs, path: string, r: Resolution): WalkFrame[] {
  const rec = createRecorder<WalkFrame>({ upto: 0 });
  r.steps.forEach((s, i) => rec.snap(stepCaption(f, s, i), 1.2, { upto: i + 1 }));
  const reads = r.steps.length;
  rec.close(
    r.error ? (
      <>
        <code>cat {path}</code> failed after {plural(reads, 'block read')}: the last directory has no such name.
      </>
    ) : (
      <>
        <code>cat {path}</code> took {plural(reads, 'block read')}: {r.steps.filter((s) => s.kind === 'inode').length} inodes, {r.steps.filter((s) => s.kind === 'dir').length}{' '}
        directory blocks and {r.steps.filter((s) => s.kind === 'data').length} data blocks, with nothing cached (the kernel keeps recent ones in memory). Every directory on the way is just a file of names.
      </>
    ),
    2,
  );
  return rec.frames;
}
