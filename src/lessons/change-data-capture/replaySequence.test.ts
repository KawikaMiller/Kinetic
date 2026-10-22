import { describe, expect, it } from 'vitest';
import { sequenceLayout } from '../../core/sequenceLayout';
import { REPLAY_OPEN, REPLAY_OPS, STEP_MS, END_MS, replay, replaySequence } from './view';
import type { Fault, Scenario } from './cdc';

const scenario = (faults: Fault[]): Scenario => ({ seed: 1, ops: REPLAY_OPS, faults, flags: REPLAY_OPEN.flags, loss: 0, duplicate: 0 });

describe('the replay ladder', () => {
  it('can be laid out at every moment of the run with "Duplicate the last event" pressed at any moment (it is sent by the harness, not by a lane)', () => {
    for (let at = 0; at <= END_MS; at += 20 * STEP_MS) {
      const faults: Fault[] = [{ kind: 'dup', at }];
      for (let now = 0; now <= END_MS; now += 4 * STEP_MS) {
        const seq = replaySequence(replay(scenario(faults), now).trace);
        expect(() => sequenceLayout(seq.actors, seq.messages), `dup at ${at}, now ${now}`).not.toThrow();
      }
    }
  });

  it('draws the injected duplicate, from a lane of its own that exists only while it is drawn', () => {
    const withDup = replaySequence(replay(scenario([{ kind: 'dup', at: 20 }]), 21).trace);
    expect(withDup.messages.some((m) => m.label === 'duplicate the last event' && m.from === 'client')).toBe(true);
    expect(withDup.actors.map((a) => a.id)).toContain('client');
    expect(replaySequence(replay(scenario([]), END_MS).trace).actors.map((a) => a.id)).not.toContain('client');
  });
});
