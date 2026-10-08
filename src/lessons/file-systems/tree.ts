import type { TreeShape } from '../../components/TreeSvg';
import { ROOT_INO, type Fs } from './fs';

/** The directory tree drawn from the directories themselves: one node per directory entry. */
export interface EntryNode {
  key: string;
  name: string;
  ino: number;
}

export function treeOf(fs: Fs) {
  const nodes = new Map<string, EntryNode>([['/', { key: '/', name: '/', ino: ROOT_INO }]]);
  const children = new Map<string, string[]>();
  const visit = (key: string, ino: number) => {
    const kids = (fs.dirs.get(ino) ?? []).map((e) => {
      const k = key === '/' ? `/${e.name}` : `${key}/${e.name}`;
      nodes.set(k, { key: k, name: e.name, ino: e.ino });
      if (fs.inodes.get(e.ino)?.kind === 'dir') visit(k, e.ino);
      return k;
    });
    children.set(key, kids);
  };
  visit('/', ROOT_INO);
  const shape: TreeShape<string> = { root: '/', children: (k) => children.get(k) ?? [] };
  return { nodes, shape };
}
