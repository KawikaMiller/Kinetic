/**
 * consistency-models: what each scene shows, computed from the model so a caption or a colour can never say more than the
 * checkers did. Pure (no React).
 */
import { ORDER_MODELS, explainViolation, orderVerdict, smallestViolation, strongestHolding, type Op, type OrderModel, type Verdict } from './model';
import { failureAt, opsUpTo, type ServiceOp, type ServiceRun } from './service';

export type Verdicts3 = Record<OrderModel, Verdict>;

/** How a model sits in the chain, given the strongest one that holds. */
export type ChainState = 'strongest' | 'implied' | 'fails';

/** `strongest` is the strongest model that holds, `implied` the weaker ones (a stronger model holding means they hold), `fails` the stronger ones. */
export function chainStates(holding: OrderModel | null): Record<OrderModel, ChainState> {
  const at = holding ? ORDER_MODELS.indexOf(holding) : ORDER_MODELS.length;
  return Object.fromEntries(ORDER_MODELS.map((m, i): [OrderModel, ChainState] => [m, i < at ? 'fails' : i === at ? 'strongest' : 'implied'])) as Record<OrderModel, ChainState>;
}

/** The first model, strongest first, that the history breaks, or null when it breaks none. */
export const firstFailing = (v: Record<OrderModel, Verdict>): OrderModel | null => ORDER_MODELS.find((m) => !v[m].ok) ?? null;

export interface ServiceView {
  /** The operations as the checkers see them at the replay time. */
  ops: Op[];
  verdicts: Verdicts3;
  strongest: OrderModel | null;
  /** The model the explanation is about: the strongest-first failing one. */
  explained: OrderModel | null;
  /** The smallest set of operations that breaks `explained`, and what rule that breaks. */
  subset: Op[] | null;
  why: string | null;
}

export function serviceView(run: ServiceRun, t: number): ServiceView {
  const ops = opsUpTo(run.ops, t);
  const verdicts = Object.fromEntries(ORDER_MODELS.map((m) => [m, orderVerdict(m, ops)])) as Verdicts3;
  const explained = firstFailing(verdicts);
  const subset = explained ? smallestViolation(explained, ops) : null;
  return { ops, verdicts, strongest: strongestHolding(verdicts), explained, subset, why: explained && subset ? explainViolation(explained, subset) : null };
}

/** The true time of the response at which the history first stops satisfying `model`, or null if it never does. */
export function firstBreakTime(model: OrderModel, ops: readonly ServiceOp[]): number | null {
  const times = [...new Set(ops.flatMap((o) => (o.response === null ? [] : [o.response])))].sort((a, b) => a - b);
  return times.find((t) => failureAt(model, ops, t) !== null) ?? null;
}

/** How many of the run's operations have answered by `t`. */
export const answeredBy = (ops: readonly ServiceOp[], t: number): number => ops.filter((o) => o.response !== null && o.response <= t).length;
