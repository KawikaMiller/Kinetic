import { describe, expect, it } from 'vitest';
import { humanDuration } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { blankStart, introFor, leaseIntro, sceneFrames, stepCaption } from './frames';
import { doraScene, exhaustedScene, leaseScene, leaseTimers, relayScene, twoServersScene } from './model';

describe('captions follow the model', () => {
  it('every step caption names the addresses its own wire carries', () => {
    for (const scene of [doraScene(), twoServersScene(), relayScene(), exhaustedScene(mulberry32(2))]) {
      for (const s of scene.steps) {
        const text = captionText(stepCaption(s));
        expect(text.length).toBeGreaterThan(20);
        if (s.event === 'ack') expect(text).toContain(`from ${s.wire!.src.ip}: the lease on ${s.wire!.addr}`);
        else if (s.wire && s.event !== 'request') expect(text).toContain(`${s.wire.dst.ip}:${s.wire.dst.port}`);
        if (s.event === 'request') expect(text).toContain(s.wire!.server!);
        if (s.event === 'apipa') expect(text).toContain(s.config.ip.value);
      }
    }
  });

  it('the relay caption names the subnet of the address actually offered', () => {
    const scene = relayScene();
    const down = scene.steps.find((s) => s.event === 'relay-down')!;
    expect(captionText(stepCaption(down))).toContain(`chose a ${down.wire!.addr!.split('.').slice(0, 3).join('.')}.x address`);
  });

  it('frames start with nothing on the wire and end on the last step', () => {
    for (const [id, scene] of [['dora', doraScene()], ['two', twoServersScene()], ['relay', relayScene()]] as const) {
      const frames = sceneFrames(scene, introFor(id), blankStart(scene.steps[0].pools));
      expect(frames[0].step).toBe(-1);
      expect(frames[0].config.ip.state).toBe('empty');
      expect(frames).toHaveLength(scene.steps.length + 1);
      expect(frames.at(-1)!.config.ip.state).toBe('set');
    }
  });

  it('the lease clock is true for every lease length and server state (full cross product)', () => {
    for (let h = 1; h <= 24; h++) {
      for (const up of [true, false]) {
        const lease = h * 3600;
        const scene = leaseScene(lease, up);
        const { t1, t2 } = leaseTimers(lease);
        const intro = captionText(leaseIntro(lease, up));
        expect(intro).toContain(`T1 = ${humanDuration(t1)}`);
        expect(intro).toContain(`T2 = ${humanDuration(t2)}`);
        expect(intro).toContain(up ? 'is up' : 'gone down');
        const last = captionText(stepCaption(scene.steps.at(-1)!));
        expect(last).toMatch(up ? /lease is extended/ : /lease is over/);
        const first = captionText(stepCaption(scene.steps[0]));
        expect(first.includes('lost')).toBe(!up);
      }
    }
  });
});
