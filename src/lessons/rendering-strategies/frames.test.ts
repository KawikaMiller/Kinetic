import { Fragment, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildFrames } from './frames';
import { PRESETS, STRATEGY_IDS, milestones, timeline, valleyMs, type PresetId, type StrategyId } from './model';

const text = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node)).replace(/<[^>]+>/g, '');
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

describe('the frames', () => {
  it('start at 0, then one frame per distinct moment of the shown lanes, in time order', () => {
    for (const p of PRESET_IDS) {
      const input = PRESETS[p].inputs;
      const frames = buildFrames(input, STRATEGY_IDS, 'ignored');
      const times = [...new Set(milestones(input, STRATEGY_IDS).map((m) => m.at))];
      expect(frames.map((f) => f.now)).toEqual([0, ...times]);
    }
  });

  it('only mention a lane that is shown', () => {
    const frames = buildFrames(PRESETS.default.inputs, ['ssg'], 'ignored');
    for (const f of frames.slice(1)) {
      const s = text(f.say);
      expect(s).toContain('SSG');
      for (const other of ['CSR', 'SSR', 'Streaming']) expect(s).not.toContain(other);
    }
  });

  it('say a tap in the valley is ignored or replayed exactly for the lanes that have a valley, and agree with the model on its length', () => {
    for (const tap of ['ignored', 'replayed'] as const) {
      const input = PRESETS.phone.inputs;
      for (const id of STRATEGY_IDS) {
        const t = timeline(id as StrategyId, input);
        const frame = buildFrames(input, [id], tap).find((f) => f.now === t.interactiveAt)!;
        const s = text(frame.say);
        if (valleyMs(t) === 0) expect(s).toContain('no gap');
        else {
          expect(s).toContain(`${Math.round(valleyMs(t))} ms after the content was visible`);
          expect(s).toContain(tap === 'ignored' ? 'ignored' : 'replayed');
        }
      }
    }
  });

  it('the CSR caption for first paint comes after the script arrived, and a server-rendered one before it', () => {
    const input = PRESETS.default.inputs;
    const first = (id: StrategyId) => buildFrames(input, [id], 'ignored').find((f) => text(f.say).includes('painted') || text(f.say).includes('drawn the page'))!;
    expect(first('csr').now).toBeGreaterThan(timeline('csr', input).jsDoneAt);
    expect(first('ssr').now).toBeLessThan(timeline('ssr', input).jsDoneAt);
  });
});
