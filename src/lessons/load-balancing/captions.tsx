/**
 * Every caption the load-balancing stage shows. Numbers come from the simulation's own constants
 * (the slow server's slowdown, the health-check delay, the spike's size and length), so a caption
 * changes with the model instead of drifting from it.
 */
import type { ReactNode } from 'react';
import { capacityPerSec, DEFAULT_RATE, evenSplitLimit, HEALTH_DELAY, PRESETS, serverName, SPIKE, type HealthChange, type Insight, type PresetId } from './sim';
import { strategy, type StrategyId } from './strategies';

/** How many times slower the slow preset's server is than the others. */
export const SLOWDOWN = Math.max(...PRESETS.slow.speeds) / Math.min(...PRESETS.slow.speeds);

const STRATEGY_SAY: Record<StrategyId, ReactNode> = {
  rr: <><span className="hl">Round robin</span>: next server in line, busy or not. Keep an eye on the slow one.</>,
  random: <><span className="hl violet">Random</span>: roll a die. Fair on average, but unlucky bursts pile up.</>,
  least: <><span className="hl ok">Least connections</span>: send it to whoever has the fewest in flight. Adapts to slow servers.</>,
  p2c: <><span className="hl info">Power of two choices</span>: pick 2 at random, use the less busy one. It gets much of least-connections' benefit with far less bookkeeping.</>,
  wrr: <><span className="hl">Weighted round robin</span>: faster servers get more turns. Here the weights are the servers' true speeds, which is what makes it work.</>,
};

/** Whole requests per second, rounded down so a claim like "about 20/s" never overstates. */
const perSecond = (n: number) => Math.floor(n);
const EQUAL_CAPACITY = perSecond(capacityPerSec(PRESETS.equal.speeds));
const MIXED_EVEN_LIMIT = perSecond(evenSplitLimit(PRESETS.mixed.speeds));

const FLEET_SAY: Record<PresetId, ReactNode> = {
  slow: <>api-5 is now <span className="hl bad">{SLOWDOWN}× slower</span> than the rest. Which strategies notice?</>,
  mixed: <>A <b>mixed fleet</b>: old and new hardware. An even split hands the weakest box more than it can finish once the rate passes about {MIXED_EVEN_LIMIT} req/s, so at the default {DEFAULT_RATE} req/s the blind strategies overload it.</>,
  equal: <>All servers equal. At the default {DEFAULT_RATE} req/s every strategy copes, which is exactly why this case is misleading: the fleet tops out near {EQUAL_CAPACITY} req/s, and at the top of the rate slider even this fleet drops requests.</>,
};

export const introCaption = (): ReactNode => <>Requests stream in from the left. {STRATEGY_SAY.rr}</>;
export const strategyCaption = (id: StrategyId): ReactNode => STRATEGY_SAY[id];
export const fleetCaption = (id: PresetId): ReactNode => FLEET_SAY[id];

export function healthCaption({ server, healthy }: HealthChange): ReactNode {
  return healthy ? (
    <><span className="hl ok">{serverName(server)}</span> passed its health check → back in rotation.</>
  ) : (
    <>Health check failed → <span className="hl bad">{serverName(server)}</span> pulled from rotation. No more requests sent to a dead server.</>
  );
}

export function toggleCaption(server: number, alive: boolean): ReactNode {
  return alive ? (
    <><span className="hl ok">{serverName(server)}</span> is back up. The LB waits for a passing health check before trusting it.</>
  ) : (
    <>
      <span className="hl bad">{serverName(server)}</span> died. The LB hasn't noticed yet (its health check takes {HEALTH_DELAY} s), so requests routed
      there fail until it does.
    </>
  );
}

export function insightCaption(insight: Insight, current: StrategyId): ReactNode {
  if (insight.kind === 'lying') {
    return <>Least connections keeps favouring the dead server: its connection count is low, so it looks idle. That's why health checks matter.</>;
  }
  return (
    <>
      <span className="hl bad">{serverName(insight.server)}</span>'s queue is nearly full, and {strategy(current).label.toLowerCase()} keeps feeding it
      anyway. Those requests wait ages or get dropped.
    </>
  );
}

export const spikeCaption = (): ReactNode => (
  <>
    <span className="hl bad">Traffic spike!</span> {SPIKE.factor}× the load for {SPIKE.seconds} seconds. Queues fill up: watch which strategies keep up.
  </>
);
