/**
 * A compact AVL tree, here only to compare against the red-black tree in the last scene: it counts
 * rotations (a double rotation counts as two) and reports height. The avl-trees lesson owns the full,
 * stepped version; a lesson cannot import another lesson's folder, so this is a second, smaller copy
 * (filed as a Phase 2 request to share one model).
 */

interface AvlNode {
  key: number;
  left: AvlNode | null;
  right: AvlNode | null;
  h: number;
}

const h = (n: AvlNode | null): number => (n === null ? 0 : n.h);
const refresh = (n: AvlNode) => {
  n.h = 1 + Math.max(h(n.left), h(n.right));
};

export class AvlRef {
  root: AvlNode | null = null;
  rotations = 0;

  private rotateRight(n: AvlNode): AvlNode {
    const up = n.left as AvlNode;
    n.left = up.right;
    up.right = n;
    refresh(n);
    refresh(up);
    this.rotations++;
    return up;
  }

  private rotateLeft(n: AvlNode): AvlNode {
    const up = n.right as AvlNode;
    n.right = up.left;
    up.left = n;
    refresh(n);
    refresh(up);
    this.rotations++;
    return up;
  }

  private balance(n: AvlNode): AvlNode {
    refresh(n);
    const bf = h(n.right) - h(n.left);
    if (bf < -1) {
      if (h((n.left as AvlNode).right) > h((n.left as AvlNode).left)) n.left = this.rotateLeft(n.left as AvlNode);
      return this.rotateRight(n);
    }
    if (bf > 1) {
      if (h((n.right as AvlNode).left) > h((n.right as AvlNode).right)) n.right = this.rotateRight(n.right as AvlNode);
      return this.rotateLeft(n);
    }
    return n;
  }

  private add(n: AvlNode | null, key: number): AvlNode {
    if (n === null) return { key, left: null, right: null, h: 1 };
    if (key < n.key) n.left = this.add(n.left, key);
    else n.right = this.add(n.right, key);
    return this.balance(n);
  }

  private takeMin(n: AvlNode): { rest: AvlNode | null; min: AvlNode } {
    if (n.left === null) return { rest: n.right, min: n };
    const { rest, min } = this.takeMin(n.left);
    n.left = rest;
    return { rest: this.balance(n), min };
  }

  private drop(n: AvlNode | null, key: number): AvlNode | null {
    if (n === null) return null;
    if (key < n.key) n.left = this.drop(n.left, key);
    else if (key > n.key) n.right = this.drop(n.right, key);
    else {
      if (n.left === null) return n.right;
      if (n.right === null) return n.left;
      const { rest, min } = this.takeMin(n.right);
      min.right = rest;
      min.left = n.left;
      return this.balance(min);
    }
    return this.balance(n);
  }

  insert(key: number): number {
    const before = this.rotations;
    this.root = this.add(this.root, key);
    return this.rotations - before;
  }

  remove(key: number): number {
    const before = this.rotations;
    this.root = this.drop(this.root, key);
    return this.rotations - before;
  }

  get height(): number {
    return h(this.root);
  }

  /** Keys in order, and whether every node's stored height is real and every balance factor is within one. */
  audit(): { keys: number[]; valid: boolean } {
    const keys: number[] = [];
    let valid = true;
    const walk = (n: AvlNode | null): number => {
      if (n === null) return 0;
      const l = walk(n.left);
      keys.push(n.key);
      const r = walk(n.right);
      if (n.h !== 1 + Math.max(l, r) || Math.abs(r - l) > 1) valid = false;
      return 1 + Math.max(l, r);
    };
    walk(this.root);
    return { keys, valid };
  }
}
