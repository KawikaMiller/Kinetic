// What the sweep does to each kind of control. Pure: a control description in, a list of action descriptors out,
// so the plan is unit-tested and the same on every run (determinism is a goal of the sweep).

/** The hostile text list (AC-0/T2 #5): empty, blank, negative, zero, huge, overflow, NaN, emoji, markup, a list with a gap. */
export const HOSTILE_INPUTS = ['', ' ', '-1', '0', '99999999999999999999999', '1e400', 'NaN', '😀', '<b>x</b>', '3,,1'];

/** Keys pressed on a focused slider: the ends, the big steps, five small ones each way. */
export const SLIDER_KEYS = ['Home', 'End', 'PageUp', 'PageDown', ...Array(5).fill('ArrowLeft'), ...Array(5).fill('ArrowRight')];

/** Values a slider is set to: min, max, middle, one step either side of each end, and one beyond (the browser clamps). */
export function sliderValues({ min, max, step }) {
  const unit = step > 0 ? step : 1;
  const mid = min + Math.round((max - min) / 2 / unit) * unit;
  return [min, max, mid, min + unit, max - unit, min - unit, max + unit].filter((v, i, all) => Number.isFinite(v) && all.indexOf(v) === i);
}

/**
 * The actions for one control. `fast` keeps extremes and one click per control. `reverse` is the second pass
 * over buttons and radios (order-dependent state is a real defect class): one click each, nothing else.
 *
 * Action shapes: { type: 'click' } | { type: 'key', key } | { type: 'set', value } | { type: 'text', value } | { type: 'select', value }
 */
export function planActions(control, { fast = false, reverse = false } = {}) {
  const click = [{ type: 'click' }];
  if (reverse) return control.kind === 'btn' || control.kind === 'seg' ? click : [];
  switch (control.kind) {
    case 'seg':
      return control.on ? [] : click;
    case 'btn':
      return fast ? click : [...click, { type: 'key', key: 'Enter' }, { type: 'key', key: 'Space' }];
    case 'slider': {
      const values = sliderValues(control);
      const sets = (fast ? values.slice(0, 2) : values).map((value) => ({ type: 'set', value }));
      const keys = fast ? [] : SLIDER_KEYS.map((key) => ({ type: 'key', key }));
      return [...sets, ...keys];
    }
    case 'text':
      return (fast ? HOSTILE_INPUTS.slice(0, 3) : HOSTILE_INPUTS).map((value) => ({ type: 'text', value }));
    case 'select':
      return (control.options ?? []).map((value) => ({ type: 'select', value }));
    case 'checkbox':
      return fast ? click : [...click, ...click];
    case 'summary':
      return click;
    default:
      return [];
  }
}

/** A short, human-readable description of an action, for reports ("set 100", "key Home"). */
export function describeAction(action) {
  switch (action.type) {
    case 'click':
      return 'click';
    case 'key':
      return `key ${action.key}`;
    case 'set':
      return `set ${action.value}`;
    case 'text':
      return `type ${JSON.stringify(action.value)}`;
    case 'select':
      return `select ${JSON.stringify(action.value)}`;
    default:
      return action.type;
  }
}

/** Whether pressing a key counts toward the sweep's key-press tally. */
export const isKeyPress = (action) => action.type === 'key' || action.type === 'text';
