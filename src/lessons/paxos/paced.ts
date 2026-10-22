/**
 * The kit's `asDistNodes` starts a spontaneous step 1 ms after init and after every state change. Paxos needs the
 * proposer's retry to be a TIMEOUT (a delay since anything last happened) and its first start to be offset, so this
 * lesson-local wrapper drives the same pure functions with per-node delays. The protocol is untouched: only when a
 * spontaneous step is attempted differs. (A `pace` option on `asDistNodes` is a Phase 2 request.)
 */
import type { DistNode, NodeCtx } from '../../core/distSim';
import type { PureProtocol, StepResult } from '../../core/pureProtocol';

export interface Pace {
  /** Delay before the node's first spontaneous step, ms. */
  first: (id: string) => number;
  /** Delay between the last state change and the next spontaneous step (a retry timeout), ms. */
  retry: (id: string) => number;
}

const STEP_TIMER = 'step';

export function pacedNodes<S, M>(protocol: PureProtocol<S, M>, pace: Pace): Record<string, DistNode<M, S>> {
  const nodes: Record<string, DistNode<M, S>> = {};
  for (const id of protocol.nodes) {
    let state = protocol.init(id);
    const apply = (ctx: NodeCtx<M>, result: StepResult<S, M>) => {
      state = result.state;
      for (const o of result.send) ctx.send(o.to, o.payload);
      ctx.setTimer(STEP_TIMER, pace.retry(id));
    };
    nodes[id] = {
      init: (ctx) => ctx.setTimer(STEP_TIMER, pace.first(id)),
      onMessage: (ctx, msg) => apply(ctx, protocol.onMessage(id, state, { from: msg.from, payload: msg.payload })),
      onTimer: (ctx) => {
        const result = protocol.onTimeout?.(id, state);
        if (result) apply(ctx, result);
      },
      snapshot: () => state,
    };
  }
  return nodes;
}
