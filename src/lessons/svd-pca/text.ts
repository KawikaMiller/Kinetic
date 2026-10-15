/** Captions and labels from the model's numbers, so tests can pin the sentences. */
import { largestSavingRank, storageOfImage, storageOfRank, type MistakeResult, type PcaResult, type SvdPcaRow } from './model';

export const n2 = (x: number): string => x.toFixed(2);
export const n3 = (x: number): string => x.toFixed(3);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const deg = (x: number): string => `${x.toFixed(1)}°`;

// ── Scene 1 ──────────────────────────────────────────────────────────

export interface ImageReadout {
  k: number;
  error: number;
  discarded: number;
  /** The share of the image's energy (sum of sigma squared) the kept terms hold. */
  kept: number;
}

export function imageCaption(r: ImageReadout): string {
  const stored = storageOfRank(r.k);
  const plain = storageOfImage();
  const saving = stored < plain
    ? `The rank-${r.k} form stores ${stored} numbers against ${plain}: smaller.`
    : `The rank-${r.k} form stores ${stored} numbers against ${plain}: not smaller, because compression only pays for k up to ${largestSavingRank()} at this size.`;
  const err = r.error < 1e-9 ? 'The rebuild is exact.' : `The error ${n3(r.error)} equals the root of the discarded σ² (${n3(r.discarded)}).`;
  return `${r.k} ${r.k === 1 ? 'term holds' : 'terms hold'} ${pct(r.kept)} of the image's energy. ${err} ${saving}`;
}

export const storageSentence = (k: number): string =>
  storageOfRank(k) < storageOfImage() ? `${storageOfRank(k)} vs ${storageOfImage()} numbers: smaller` : `${storageOfRank(k)} vs ${storageOfImage()} numbers: not smaller`;

// ── Scene 2 ──────────────────────────────────────────────────────────

export function cloudCaption(r: PcaResult, n: number, turned: boolean, projected: boolean, residual: number): string {
  if (r.degenerate === 'same') return `All ${n} points are the same, so there is no spread and no principal axis to draw.`;
  const lead = `${n} points: the first axis holds ${r.explained === null ? '–' : pct(r.explained)} of the variance (λ₁ = ${n3(r.values[0])}, λ₂ = ${n3(r.values[1])}).`;
  if (r.degenerate === 'line') return `${lead} The points lie on one line, so there is no second axis.`;
  const rot = turned ? ' The data are turned so the first axis lies along x.' : '';
  const proj = projected ? ` Projecting onto PC1 leaves a total squared residual of ${n3(residual)}, which is n × λ₂ = ${n3(n * r.values[1])}: the variance PC2 holds.` : '';
  return `${lead}${rot}${proj}`;
}

// ── Scene 3 ──────────────────────────────────────────────────────────

export function mistakesCaption(r: MistakeResult, o: { centre: boolean; units: 'm' | 'cm'; standardise: boolean }): string {
  const axis = `The first axis points at ${deg(r.angle1)} (feature 1 across, feature 2 up) and holds ${pct(r.explained)} of the variance.`;
  if (o.standardise) {
    return `Standardised, both features count equally: the eigenvalues are 1 ± |ρ| = ${n3(r.values[0])} and ${n3(r.values[1])} with ρ = ${n3(r.rho)}, and the axes sit at 45° from the features. ${axis}`;
  }
  if (!o.centre) return `${axis} The data were not centred, so the first axis points toward the mean (${deg(r.meanAngle)}), not along the spread: the wrong answer.`;
  return `${axis} With raw ${o.units === 'm' ? 'metres and kilograms' : 'centimetres and kilograms'} the feature with the larger numbers dominates, so changing the units changes the axis.`;
}

// ── Scene 4 ──────────────────────────────────────────────────────────

export function classCaption(pc1: number, pc2: number, explained: number | null): string {
  const share = explained === null ? '' : `PC1 holds ${pct(explained)} of the variance, yet`;
  return `${share} a single cut on PC1 sorts ${pct(pc1)} of the points into the right class, and a cut on PC2 sorts ${pct(pc2)}. PCA keeps variance, not what predicts a label.`.trim();
}

// ── Scene 5 ──────────────────────────────────────────────────────────

export function linkCaption(rows: readonly SvdPcaRow[], n: number): string {
  const gap = Math.max(...rows.map((r) => Math.abs(r.fromSvd - r.fromCovariance)));
  return `For centred data with ${n} rows, each singular value squared divided by n − 1 matches a covariance eigenvalue: ${rows.map((r) => n3(r.fromSvd)).join(', ')} (largest difference ${gap.toExponential(1)}). The same numbers, from two routes.`;
}
