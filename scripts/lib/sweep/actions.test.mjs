import { describe, expect, it } from 'vitest';
import { describeAction, HOSTILE_INPUTS, planActions, SLIDER_KEYS, sliderValues } from './actions.mjs';

describe('sliderValues', () => {
  it('covers min, max, the middle, a step inside each end and one beyond each end, without repeats', () => {
    expect(sliderValues({ min: 0, max: 10, step: 1 })).toEqual([0, 10, 5, 1, 9, -1, 11]);
    expect(sliderValues({ min: 0, max: 1, step: 1 })).toEqual([0, 1, -1, 2]);
  });
});

describe('planActions', () => {
  const slider = { kind: 'slider', min: 0, max: 100, step: 5 };

  it('a slider gets extremes and the full key list; fast keeps only min and max', () => {
    const plan = planActions(slider);
    expect(plan.filter((a) => a.type === 'set').map((a) => a.value)).toEqual(expect.arrayContaining([0, 100, 105, -5]));
    expect(plan.filter((a) => a.type === 'key').map((a) => a.key)).toEqual(SLIDER_KEYS);
    expect(planActions(slider, { fast: true })).toEqual([{ type: 'set', value: 0 }, { type: 'set', value: 100 }]);
  });

  it('a text field gets the hostile list, an empty one and a huge one included', () => {
    const values = planActions({ kind: 'text' }).map((a) => a.value);
    expect(values).toEqual(HOSTILE_INPUTS);
    expect(values).toEqual(expect.arrayContaining(['', '1e400', 'NaN', '-1']));
  });

  it('a select gets every option, a button a click and both activation keys, a lit radio nothing', () => {
    expect(planActions({ kind: 'select', options: ['a', 'b'] })).toEqual([{ type: 'select', value: 'a' }, { type: 'select', value: 'b' }]);
    expect(planActions({ kind: 'btn' })).toEqual([{ type: 'click' }, { type: 'key', key: 'Enter' }, { type: 'key', key: 'Space' }]);
    expect(planActions({ kind: 'seg', on: true })).toEqual([]);
    expect(planActions({ kind: 'seg', on: false })).toEqual([{ type: 'click' }]);
  });

  it('the reverse pass is one click on buttons and radios, nothing else', () => {
    expect(planActions({ kind: 'btn' }, { reverse: true })).toEqual([{ type: 'click' }]);
    expect(planActions({ kind: 'seg', on: true }, { reverse: true })).toEqual([{ type: 'click' }]);
    expect(planActions(slider, { reverse: true })).toEqual([]);
  });

  it('is deterministic', () => {
    expect(planActions(slider)).toEqual(planActions(slider));
  });

  it('describes actions readably', () => {
    expect(describeAction({ type: 'key', key: 'Home' })).toBe('key Home');
    expect(describeAction({ type: 'text', value: '' })).toBe('type ""');
  });
});
