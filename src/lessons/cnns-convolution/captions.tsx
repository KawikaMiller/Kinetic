import type { ReactNode } from 'react';
import { pctText } from '../../core/format';
import { convParams, denseParams, type ShiftReport } from './convolve';
import { KERNEL_SIZE, LEARNED_AT, type GalleryEntry } from './learn';
import { LAYER_SPEC, type LayerKind, type LayerRow } from './stack';

const sh = (s: number) => (s > 0 ? `+${s}` : String(s));

export function poolCaption(report: ShiftReport, column: number, shift: number): ReactNode {
  const cells = report.original.pooled.flat().length;
  if (shift === 0) {
    return <>A vertical bar in column {column + 1}, not shifted: the vertical-edge kernel (with ReLU) responds on the bar&apos;s left edge, and pooling keeps the strongest value in each 2 x 2 block. Pick a shift.</>;
  }
  return (
    <>
      Bar in column {column + 1}, shifted {sh(shift)}: the feature map {report.mapShifted ? 'moved with the bar' : 'did not simply move'} (equivariance), and the pooled map{' '}
      {report.pooledChanged === 0 ? <b>stayed the same</b> : <b>changed in {report.pooledChanged} of {cells} cells</b>}.{' '}
      {report.pooledChanged === 0
        ? 'Pooling hid this small shift, which is some robustness, not a guarantee.'
        : 'The strong value crossed a pooling boundary, so pooling did not hide this shift.'}
    </>
  );
}

export interface LearnCaptionInput {
  epoch: number;
  loss: number;
  trainAccuracy: number;
  heldOut: number;
  kernels: number;
}

export function learnCaption(s: LearnCaptionInput): ReactNode {
  if (s.epoch === 0) {
    return <>Untrained: {s.kernels} random 3 x 3 {s.kernels === 1 ? 'kernel' : 'kernels'}, loss {s.loss.toFixed(3)}, held-out accuracy {pctText(s.heldOut, 0)}. Press Play to fit them to the bars.</>;
  }
  return (
    <>
      Epoch {s.epoch}: loss <b>{s.loss.toFixed(3)}</b>, training accuracy {pctText(s.trainAccuracy, 0)}, held-out accuracy <b>{pctText(s.heldOut, 0)}</b> on images the net never trained on.
      {s.heldOut >= LEARNED_AT ? ' This toy fitted a detector for these bars.' : ' Not there yet on these held-out bars.'}
    </>
  );
}

export function galleryCaption(entries: readonly GalleryEntry[], learned: number): ReactNode {
  return (
    <>
      {learned} of {entries.length} seeds reached {pctText(LEARNED_AT, 0)} held-out accuracy. The kernels differ from seed to seed: the one on this seed is not the only one that works.
    </>
  );
}

export function parameterSentence(kernels: number, side: number): ReactNode {
  const out = side - KERNEL_SIZE + 1;
  const conv = convParams(kernels, KERNEL_SIZE);
  const dense = denseParams(side * side, out * out) * kernels;
  return (
    <>
      The conv layer learns {kernels} x ({KERNEL_SIZE} x {KERNEL_SIZE} + 1) = <b>{conv}</b> numbers whatever the image size. A dense layer making the same {out} x {out} output
      from {side * side} pixels needs {side * side} x {out * out} + {out * out} = <b>{denseParams(side * side, out * out).toLocaleString('en-US')}</b>
      {kernels > 1 ? ` per kernel, ${dense.toLocaleString('en-US')} for ${kernels}` : ''}.
    </>
  );
}

/** "an" before a number read aloud with a vowel sound (8, 11, 18, 80 to 89), else "a". */
const indefiniteArticle = (n: number) => (/^(8[0-9]?|11|18)$/.test(String(n)) ? 'an' : 'a');

export function stackCaption(layers: readonly LayerKind[], rows: readonly LayerRow[], mode: 'field' | 'pixel', agree: boolean | null): ReactNode {
  if (rows.length === 0) return <>No layers yet: each output cell is one input pixel, so its receptive field is 1 x 1. Add a convolution or a pool.</>;
  const last = rows[rows.length - 1];
  const chain = layers.map((l) => LAYER_SPEC[l].label).join(', then ');
  return (
    <>
      {chain}: the output is {last.side} x {last.side} and each output cell sees {indefiniteArticle(last.field)} <b>{last.field} x {last.field}</b> patch of the input (receptive field), a step of {last.jump} input{' '}
      {last.jump === 1 ? 'pixel' : 'pixels'} between neighbours.{' '}
      {mode === 'pixel' && agree !== null && (agree ? 'The cells that moved when one pixel changed are exactly the ones its receptive field predicts.' : 'The moved cells and the prediction disagree.')}
    </>
  );
}
