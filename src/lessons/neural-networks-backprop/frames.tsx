import { sig } from '../../core/format';
import type { Frame } from '../../core/types';
import type { ChainRule } from './model';

/** The five steps of one backward pass, in order. */
export const BACK_STEPS = ['Forward', 'Output error', 'Output weights', 'Hidden errors', 'Hidden weights'] as const;
export const LAST_STEP = BACK_STEPS.length - 1;

export interface BackFrame extends Frame {
  step: number;
}

const vec2 = (a: readonly number[]) => `(${sig(a[0])}, ${sig(a[1])})`;
const labelText = (y: number) => (y === 1 ? 'class 1' : 'class 0');

/** The chain-rule lines, with this example's real numbers in them. */
export function chainLines(c: ChainRule, broken: boolean): string[] {
  const loss = c.y === 1 ? `-ln(p) = ${sig(c.loss)}` : `-ln(1 - p) = ${sig(c.loss)}`;
  const g = c.gradient;
  return [
    `h = tanh(W1 x + b1) = ${vec2(c.h)}    p = σ(w2·h + b2) = ${sig(c.p)}    loss = ${loss}`,
    `δ_out = p - y = ${sig(c.p)} - ${c.y} = ${sig(c.deltaOut)}`,
    `∂L/∂w2 = δ_out · h = ${vec2(g.slice(6, 8))}    ∂L/∂b2 = δ_out = ${sig(g[8])}`,
    broken
      ? `δ_h = w2 · δ_out = ${vec2(c.deltaHidden)}    (the 1 - h² slope is dropped)`
      : `δ_h = w2 · δ_out · (1 - h²) = ${vec2(c.deltaHidden)}`,
    `∂L/∂W1 = δ_h · x = [${vec2(g.slice(0, 2))}, ${vec2(g.slice(2, 4))}]    ∂L/∂b1 = δ_h = ${vec2(g.slice(4, 6))}`,
  ];
}

/** One frame per step; each caption quotes the numbers that step computes. */
export function backwardFrames(c: ChainRule, broken: boolean): BackFrame[] {
  const point = `(${sig(c.x[0])}, ${sig(c.x[1])})`;
  return [
    {
      step: 0,
      say: (
        <>
          Forward pass on {point}, labelled {labelText(c.y)}: the network says p = <b>{sig(c.p)}</b>, so the loss is <b>{sig(c.loss)}</b>. Everything the backward pass needs is
          saved from this pass.
        </>
      ),
    },
    {
      step: 1,
      say: (
        <>
          Output error: for a sigmoid output with cross-entropy loss, δ_out is just p − y = {sig(c.p)} − {c.y} = <b>{sig(c.deltaOut)}</b>. It is negative when the network said
          too little, positive when it said too much.
        </>
      ),
    },
    {
      step: 2,
      say: (
        <>
          Each output weight's gradient is the error times the activation that came through it: δ_out · h = <b>{vec2(c.gradient.slice(6, 8))}</b>. A big activation means a big
          share of the blame.
        </>
      ),
    },
    {
      step: 3,
      say: broken ? (
        <>
          <span className="hl bad">Broken on purpose</span>: the hidden errors skip the tanh slope, δ_h = w2 · δ_out = <b>{vec2(c.deltaHidden)}</b>. Without the (1 − h²) factor
          these are not the gradients of the loss.
        </>
      ) : (
        <>
          The error flows backward along the same edges: δ_h = w2 · δ_out · (1 − h²) = <b>{vec2(c.deltaHidden)}</b>. The factor (1 − h²) is the tanh slope, so a saturated unit (h
          near ±1) passes almost nothing back.
        </>
      ),
    },
    {
      step: 4,
      say: (
        <>
          Hidden weight gradients are δ_h times the input that fed them, and the biases take δ_h directly. All nine gradients came from one forward and one backward pass; then
          gradient descent steps against them.
        </>
      ),
    },
  ];
}
