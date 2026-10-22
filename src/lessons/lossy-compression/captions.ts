/** Captions for every scene, built from the model so each number is the one on screen. Plain strings. */
import { decimal, integer, pct, plural } from '../../core/format';
import { SOURCES, analyseBlock, quantiseBlock, type BlockState, type QuantState } from './blocks';
import { RAW_BYTES, type Generations, type QualityPoint } from './image';

const n2 = (v: number) => decimal(v, 2);
const sourceLabel = (id: string) => SOURCES.find((s) => s.value === id)?.label ?? id;
/** The block as a phrase: 'the smooth gradient', but 'your painted block' for the one the learner paints. */
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const subject = (id: string) => (id === 'painted' ? 'your painted block' : `the ${sourceLabel(id)}`);
export const dB = (v: number) => (Number.isFinite(v) ? `${decimal(v, 1)} dB` : 'infinite');

export function blockCaption(s: BlockState): string {
  const r = analyseBlock(s);
  const zeroed = s.zeroed.filter(Boolean).length;
  const lead = `${capital(subject(s.source))}: ${r.holding90 === 0 ? 'it has no energy after the shift, so there is nothing to count' : `${plural(r.holding90, 'coefficient')} of 64 ${r.holding90 === 1 ? 'holds' : 'hold'} 90% of its energy`}.`;
  if (zeroed === 0) return `${lead} Click a coefficient to zero it, or paint the block, and watch the reconstruction.`;
  const psnrText = Number.isFinite(r.psnr) ? `PSNR ${dB(r.psnr)}` : 'PSNR infinite because nothing differs';
  return `${lead} With ${plural(zeroed, 'coefficient')} zeroed, ${pct(r.keptEnergy)} of the energy is kept, the MSE is ${n2(r.mse)} and ${psnrText}; the largest pixel error is ${r.maxError}.`;
}

export function quantCaption(s: QuantState): string {
  const r = quantiseBlock(s);
  const after = 64 - (r.lastNonZero + 1);
  const zigzag = r.lastNonZero < 0
    ? 'all 64 levels are zero'
    : `the last is at position ${r.lastNonZero + 1} of the zig-zag scan, so ${after === 0 ? 'no run of zeros follows it' : `the ${after} after it are a run of zeros`}`;
  const collapsed = r.nonZero <= 1 ? ' The block has collapsed toward a flat patch.' : '';
  return `${sourceLabel(s.source)} at quality ${s.quality}: ${r.nonZero} of 64 levels are non-zero (${zigzag}). The MSE is ${n2(r.mse)}, PSNR ${dB(r.psnr)}, largest pixel error ${r.maxError}.${collapsed}`;
}

export function imageCaption(q: number, p: QualityPoint): string {
  return `Quality ${q}: an estimated ${integer(Math.round(p.bytes))} bytes against ${integer(RAW_BYTES)} raw, ${decimal(RAW_BYTES / p.bytes, 1)} times smaller; MSE ${n2(p.mse)}, PSNR ${dB(p.psnr)}. The size is an estimate from symbol entropy, not a real JPEG file.`;
}

export function generationCaption(quality: number, shift: number, g: Generations): string {
  const n = g.changed.length;
  const first = g.changed[0];
  const last = g.changed[n - 1];
  const where = shift === 0 ? 'with the grid aligned' : `shifting ${plural(shift, 'pixel')} between saves`;
  const share = first === 0 ? 'no pixels changed at all' : last === 0 ? 'no pixels, so an aligned re-save no longer changes anything' : `${pct(last / first)} as many pixels as the first`;
  const saves = n === 1 ? `save 1 changed ${integer(first)} pixels` : `save 1 changed ${integer(first)} pixels and save ${n} changed ${integer(last)}, ${share}`;
  return `${plural(n, 'save')} at quality ${quality}, ${where}: ${saves}. Against the original moved the same way, the PSNR is ${dB(g.psnr[n - 1])}.`;
}
