// The live run behind the stage: one seeded cluster, stepped in fixed ticks (so a seed with no clicks
// replays the same run whatever the frame rate or speed), with the safety monitor watching every event.
import { mulberry32 } from '../../core/random';
import { TICK_MS } from './check';
import { SafetyMonitor } from './safety';
import { Raft, type RaftVariant } from './sim';

export const DEFAULT_SEED = 7;

export class LiveRaft {
  readonly raft: Raft;
  readonly monitor = new SafetyMonitor();
  private pendingMs = 0;

  constructor(seed: number, variant: RaftVariant) {
    this.raft = new Raft({ rnd: mulberry32(seed), variant });
    this.raft.observer = (r) => this.monitor.observe(r);
  }

  /** Advance by `ms` of simulated time, in whole ticks; the remainder waits for the next call. */
  advance(ms: number) {
    this.pendingMs += ms;
    while (this.pendingMs >= TICK_MS) {
      this.raft.step(TICK_MS);
      this.pendingMs -= TICK_MS;
    }
  }
}
