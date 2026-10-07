import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames, linkBehaviour, type Scenario } from './frames';
import { N, simulate } from './sim';

const SCENARIOS: Scenario[] = ['file', 'video'];
/** Slider ends and the defaults, in percent. */
const LOSSES = [0, 1, 15, 40];
const REORDERS = [0, 1, 20, 50];
const SEEDS = [1, 2, 3, 19, 20, 21];

function* combos() {
  for (const scenario of SCENARIOS) {
    for (const loss of LOSSES) {
      for (const reorder of REORDERS) {
        for (const seed of SEEDS) {
          const link = { loss: loss / 100, reorder: reorder / 100 };
          const ticks = simulate(seed, link.loss, link.reorder);
          yield { scenario, link, ticks, frames: buildFrames(ticks, scenario, link) };
        }
      }
    }
  }
}

describe('linkBehaviour', () => {
  it('names exactly what the sliders allow', () => {
    expect(linkBehaviour({ loss: 0.15, reorder: 0.2 })).toBe('loses and reorders packets');
    expect(linkBehaviour({ loss: 0.15, reorder: 0 })).toBe('loses packets but keeps their order');
    expect(linkBehaviour({ loss: 0, reorder: 0.2 })).toBe('reorders packets but never loses one');
    expect(linkBehaviour({ loss: 0, reorder: 0 })).toBe('neither loses nor reorders packets');
  });
});

describe('captions are true at every slider setting', () => {
  it('the opening describes the link the run actually used', () => {
    for (const { link, frames } of combos()) expect(text(frames[0].say)).toContain(`a link that ${linkBehaviour(link)}`);
  });

  it('the file verdict reports UDP loss only when there was some, and TCP finishing in order', () => {
    for (const { scenario, frames } of combos()) {
      if (scenario !== 'file') continue;
      const last = frames.at(-1)!;
      const say = text(last.say);
      expect(say).toContain(`all ${N} in order (it took ${last.tcp.doneAt} ticks)`);
      expect(say).toContain(`finished at tick ${last.udp.doneAt}`);
      if (last.udp.lost.length > 0) expect(say).toMatch(new RegExp(`missing ${last.udp.lost.length} chunks?\\.`));
      else expect(say).toContain('nothing lost this time');
    }
  });

  it('the video verdict reports the measured gap, resends and UDP skips', () => {
    for (const { scenario, frames } of combos()) {
      if (scenario !== 'video') continue;
      const { tcp, udp, say } = frames.at(-1)!;
      const s = text(say);
      expect(s).toContain(`was ${tcp.longestStall} ticks`);
      if (tcp.retransmits > 0) expect(s).toMatch(new RegExp(`resent ${tcp.retransmits} packets?\\.`));
      else expect(s).toContain('nothing lost or resent');
      if (udp.lost.length > 0) expect(s).toMatch(new RegExp(`skipped ${udp.lost.length} frames?`));
      else expect(s).toContain('UDP lost nothing');
    }
  });

  it('every frame states its own caption, so a timeline jump never shows a stale one', () => {
    for (const { frames } of combos()) {
      // (the last frame is the verdict, checked above)
      for (const f of frames.slice(1, -1)) {
        expect(f.say).toBeDefined();
        if (f.events.length) continue;
        expect(text(f.say)).toContain(`TCP has handed ${f.tcp.delivered.length}/${N}`);
        expect(text(f.say)).toContain(`UDP: ${f.udp.delivered.length} arrived`);
        if (f.udp.lost.length) expect(text(f.say)).toContain(`${f.udp.lost.length} lost`);
      }
    }
  });

  it('each event caption names the event in its own frame', () => {
    for (const { frames } of combos()) {
      for (const f of frames) {
        const s = text(f.say);
        for (const e of f.events) {
          if (e.kind === 'retx') expect(s).toContain(`No ACK for #${e.seq} before the timeout`);
          if (e.kind === 'release' && s.includes('finally made it')) expect(s).toContain(`#${e.seqs[0]}–#${e.seqs.at(-1)}`);
        }
      }
    }
  });
});
