/**
 * byzantine-faults, scene 3: signed orders at n = 3 (one commander, lieutenants L1 and L2). The signature is a MODELLED
 * tag a traitor cannot forge: no cryptography is run. A traitor commander may sign two different orders (equivocate) or
 * send nothing to a lieutenant; a traitor lieutenant may withhold a relay. Nobody can alter a signed order.
 * Decision rule: a lieutenant that holds exactly one signed value obeys it; two different values (the commander
 * equivocated) or none at all means retreat.
 */
import { ATTACK, RETREAT, type Bit } from './om';

export type Signed = Bit | null;
export const SIGNED_N = 3;
export const SIGNED_LIEUTENANTS = [1, 2] as const;

export interface SignedBehaviour {
  /** 0 is the commander, 1 or 2 a lieutenant. */
  traitor: number;
  /** A traitor commander: what it signs for L1 and L2 (null: nothing is sent). */
  given: readonly [Signed, Signed];
  /** A loyal commander's order. */
  order: Bit;
  /** A traitor lieutenant: it keeps the relay to itself. */
  withhold: boolean;
}

/** Every traitor behaviour: 9 for a traitor commander (3 x 3) and 2 x 2 x 2 = 8 for a traitor lieutenant. */
export function signedBehaviours(): SignedBehaviour[] {
  const out: SignedBehaviour[] = [];
  const options: Signed[] = [null, RETREAT, ATTACK];
  for (const a of options) for (const b of options) out.push({ traitor: 0, given: [a, b], order: RETREAT, withhold: false });
  for (const traitor of SIGNED_LIEUTENANTS) {
    for (const order of [RETREAT, ATTACK] as Bit[]) {
      for (const withhold of [false, true]) out.push({ traitor, given: [order, order], order, withhold });
    }
  }
  return out;
}

export interface SignedRun {
  /** The distinct signed values each lieutenant holds after the relay round. */
  holds: Map<number, Bit[]>;
  decisions: Map<number, Bit>;
  ic1: boolean;
  ic2: boolean;
}

/** The rule: one signed value is obeyed; none or two different ones mean retreat. */
export const decideSigned = (values: readonly Bit[]): Bit => (new Set(values).size === 1 ? values[0] : RETREAT);

export function runSigned(b: SignedBehaviour): SignedRun {
  const received = new Map<number, Signed>(SIGNED_LIEUTENANTS.map((i, k) => [i, b.traitor === 0 ? b.given[k] : b.order]));
  const holds = new Map<number, Bit[]>();
  for (const i of SIGNED_LIEUTENANTS) {
    const other = SIGNED_LIEUTENANTS.find((j) => j !== i)!;
    const own = received.get(i) ?? null;
    const relayed = received.get(other) ?? null;
    const relaySent = relayed !== null && !(b.traitor === other && b.withhold);
    holds.set(i, [...new Set([...(own === null ? [] : [own]), ...(relaySent ? [relayed] : [])])]);
  }
  const decisions = new Map(SIGNED_LIEUTENANTS.map((i) => [i, decideSigned(holds.get(i)!)] as const));
  const loyal = SIGNED_LIEUTENANTS.filter((i) => i !== b.traitor).map((i) => decisions.get(i)!);
  return {
    holds,
    decisions,
    ic1: loyal.every((d) => d === loyal[0]),
    ic2: b.traitor === 0 || loyal.every((d) => d === b.order),
  };
}

export interface SignedEnumeration {
  total: number;
  breaking: SignedBehaviour[];
}

export function trySignedBehaviours(): SignedEnumeration {
  const all = signedBehaviours();
  return { total: all.length, breaking: all.filter((b) => { const r = runSigned(b); return !r.ic1 || !r.ic2; }) };
}

