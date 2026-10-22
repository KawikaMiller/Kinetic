import { runConversation, type Algebra, type Pair, type Party, type PartyState, type RatchetMode, type Run } from './ratchet';

/**
 * The protocol over symbolic values, for formulation A of the thief: every secret is a node, a derived node is known
 * to the thief exactly when its secret inputs are, and public values are always known. Nodes are shared between the two
 * parties' derivations of the same value (a Diffie-Hellman output is one node for both sides).
 */
export type NodeKind = 'root' | 'priv' | 'rk' | 'ck' | 'mk' | 'dh';

export interface SymNode {
  id: number;
  kind: NodeKind;
  /** Every one of these must be known. */
  all: readonly number[];
  /** Any one of these is enough (a Diffie-Hellman output needs either private key). */
  any: readonly number[];
}

export interface SymPub {
  /** The private node this public key belongs to. */
  of: number;
}

export class SymGraph {
  readonly nodes: SymNode[] = [];
  private readonly memo = new Map<string, number>();

  private make(key: string, kind: NodeKind, all: readonly number[], any: readonly number[]): number {
    const known = this.memo.get(key);
    if (known !== undefined) return known;
    const id = this.nodes.length;
    this.nodes.push({ id, kind, all, any });
    this.memo.set(key, id);
    return id;
  }

  root = () => this.make('root', 'root', [], []);
  priv = (party: Party, n: number) => this.make(`priv:${party}:${n}`, 'priv', [], []);
  dh = (a: number, b: number) => this.make(`dh:${Math.min(a, b)}:${Math.max(a, b)}`, 'dh', [], [a, b]);
  kdfRk = (rk: number, d: number) => ({
    rk: this.make(`rk:${rk}:${d}`, 'rk', [rk, d], []),
    ck: this.make(`rkck:${rk}:${d}`, 'ck', [rk, d], []),
  });
  kdfCk = (ck: number) => ({ mk: this.make(`mk:${ck}`, 'mk', [ck], []), ck: this.make(`ck:${ck}`, 'ck', [ck], []) });
  chains = (root: number) => ({ ab: this.make(`ab:${root}`, 'ck', [root], []), ba: this.make(`ba:${root}`, 'ck', [root], []) });

  /** Every node reachable through a node's inputs (its ancestors), the node itself excluded. */
  ancestors(id: number): Set<number> {
    const seen = new Set<number>();
    const stack = [id];
    while (stack.length) {
      const node = this.nodes[stack.pop()!];
      for (const input of [...node.all, ...node.any]) {
        if (!seen.has(input)) {
          seen.add(input);
          stack.push(input);
        }
      }
    }
    return seen;
  }

  /** The nodes the thief can compute from `initial` (secret nodes it holds), by fixpoint over the derivation rules. */
  closure(initial: Iterable<number>): Set<number> {
    const known = new Set(initial);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of this.nodes) {
        if (known.has(node.id)) continue;
        const derivable = (node.all.length > 0 && node.all.every((i) => known.has(i))) || (node.any.length > 0 && node.any.some((i) => known.has(i)));
        if (derivable) {
          known.add(node.id);
          grew = true;
        }
      }
    }
    return known;
  }
}

export type SymAlgebra = Algebra<number, number, SymPub, number, number>;

/** The symbolic algebra over a graph. Sealing returns the message key's node, and opening always succeeds. */
export function symbolicAlgebra(g: SymGraph): SymAlgebra {
  return {
    initialRoot: () => g.root(),
    keyPair: async (party, n) => {
      const priv = g.priv(party, n);
      return { priv, pub: { of: priv } };
    },
    dh: async (priv, pub) => g.dh(priv, pub.of),
    kdfRk: async (rk, d) => g.kdfRk(rk, d),
    kdfCk: async (ck) => g.kdfCk(ck),
    chains: async (root) => g.chains(root),
    seal: async (mk) => mk,
    open: async () => 'ok',
    samePub: (a, b) => a.of === b.of,
  };
}

export interface SymRun {
  graph: SymGraph;
  run: Run<number, number, SymPub, number>;
  /** Node count once message i is done: nodes with an id at or above sizeAfter[i] were created later. */
  sizeAfter: number[];
  mode: RatchetMode;
}

/** The protocol over a pattern of senders, symbolically. `wrap` lets a test replace the algebra with a broken one. */
export async function symbolicRun(pattern: readonly Party[], mode: RatchetMode, wrap: (alg: SymAlgebra) => SymAlgebra = (alg) => alg): Promise<SymRun> {
  const graph = new SymGraph();
  const sizeAfter: number[] = [];
  const run = await runConversation(wrap(symbolicAlgebra(graph)), pattern, pattern.map((_, i) => `m${i + 1}`), mode, () => sizeAfter.push(graph.nodes.length));
  return { graph, run, sizeAfter, mode };
}

/** The secret nodes of a party's state: what a thief who copies the state holds. */
export const stolenSecrets = (s: PartyState<number, number, SymPub>): number[] => [s.rk, s.priv, s.cks, s.ckr].filter((v): v is number => v !== null);

export interface Reading {
  /** readable[i]: the thief can derive message i's key. */
  readable: boolean[];
  /** Index of the first message after the theft that is sealed to the thief, or null when none is (no healing). */
  healing: number | null;
}

/** Which messages a thief holding `party`'s state after message k (1-based) can read, by derivation closure. */
export function reading(sym: SymRun, party: Party, k: number): Reading {
  const state: PartyState<number, number, SymPub> = (sym.run.after[k - 1] as Pair<number, number, SymPub>)[party];
  const known = sym.graph.closure(stolenSecrets(state));
  const readable = sym.run.messages.map((m) => known.has(m.mk));
  let healing: number | null = null;
  for (let i = k; i < readable.length; i++) {
    if (!readable[i]) {
      healing = i;
      break;
    }
  }
  return { readable, healing };
}

/** Whether message i's key depends on a private key generated after message k: the reason a theft heals. */
export function dependsOnFreshKey(sym: SymRun, k: number, messageIndex: number): boolean {
  const boundary = sym.sizeAfter[k - 1];
  const ancestors = sym.graph.ancestors(sym.run.messages[messageIndex].mk);
  return [...ancestors].some((id) => id >= boundary && sym.graph.nodes[id].kind === 'priv');
}
