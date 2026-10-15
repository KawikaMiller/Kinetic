/** Captions and labels from the model's numbers, so tests can pin the sentences. */
import { largestSavingRank, storageOfImage, storageOfRank, type MistakeResult, type PcaResult, type SvdPcaRow } from './model';

export const n2 = (x: number): string => x.toFixed(2);
export const n3 = (x: number): string => x.toFixed(3);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const deg = (x: number): string => `${x.toFixed(1)}°`;
export const sig2 = (x: number): string => String(Number(x.toPrecision(2)));
const sig3 = (x: number): string => String(Number(x.toPrecision(3)));

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
  if (r.degenerate === 'same') return n === 1 ? 'One point has no spread, so there is no principal axis to draw.' : `All ${n} points are the same, so there is no spread and no principal axis to draw.`;
  const centring = `PCA first centres the data: it subtracts the mean (${n2(r.mean[0])}, ${n2(r.mean[1])}), the ringed point, so the axes start there.`;
  const lead = `${n} points: ${centring} The first axis holds ${r.explained === null ? '–' : pct(r.explained)} of the variance (λ₁ = ${n3(r.values[0])}, λ₂ = ${n3(r.values[1])}).`;
  if (r.degenerate === 'line') return `${lead} The points lie on one line, so there is no second axis.`;
  const rot = turned ? ' The data are turned so the first axis lies along x.' : '';
  const proj = projected ? ` Projecting onto PC1 leaves a total squared residual of ${n3(residual)}, which is n × λ₂ = ${n3(n * r.values[1])}: the variance PC2 holds.` : '';
  return `${lead}${rot}${proj}`;
}

// ── Scene 3 ──────────────────────────────────────────────────────────

export function mistakesCaption(r: MistakeResult, o: { centre: boolean; units: 'm' | 'cm'; standardise: boolean }): string {
  const axis = `The first axis points at ${deg(r.angle1)} (feature 1 across, feature 2 up) and holds ${pct(r.explained)} of the variance.`;
  if (o.standardise) {
    return `Standardised, each feature is centred and divided by its own spread, so both count equally: the eigenvalues are 1 ± |ρ| = ${n3(r.values[0])} and ${n3(r.values[1])} with ρ = ${n3(r.rho)}, and the axes sit at 45° from the features. ${axis}`;
  }
  if (!o.centre) {
    return `${axis} The data were not centred: the cloud stays out at its mean (ringed, ${deg(r.meanAngle)} from the origin) while the axes start at the origin, so the first axis points toward the mean, not along the spread: the wrong answer.`;
  }
  const heightUnit = o.units === 'm' ? 'm' : 'cm';
  const [spreadHeight, spreadWeight] = r.spreads;
  const centring = `Centring subtracted the mean (${sig3(r.means[0])} ${heightUnit}, ${sig3(r.means[1])} kg: the ringed point, before it moved) from every point, so the cloud sits on the origin where the axes start.`;
  const spread = `the feature with the larger spread in its own units dominates (${sig2(spreadHeight)} ${heightUnit} for height against ${sig2(spreadWeight)} kg for weight), so changing the units changes the axis`;
  return `${centring} ${axis} With raw ${o.units === 'm' ? 'metres and kilograms' : 'centimetres and kilograms'} ${spread}.`;
}

// ── Scene 4 ──────────────────────────────────────────────────────────

export function classCaption(pc1: number, pc2: number, explained: number | null): string {
  const share = explained === null ? '' : `PC1 holds ${pct(explained)} of the variance, yet`;
  return `${share} the best single cut on PC1 sorts ${pct(pc1)} of these points into the right class, and the best cut on PC2 sorts ${pct(pc2)} (cuts chosen on these same points after seeing the labels). PCA keeps variance, not what predicts a label.`.trim();
}

// ── Scene 5 ──────────────────────────────────────────────────────────

export function linkCaption(rows: readonly SvdPcaRow[], n: number): string {
  const gap = Math.max(...rows.map((r) => Math.abs(r.fromSvd - r.fromCovariance)));
  return `For centred data with ${n} rows, each singular value squared divided by n − 1 matches a sample-covariance eigenvalue (divided by n − 1; the point-cloud scene divides by n, the population form): ${rows.map((r) => n3(r.fromSvd)).join(', ')} (largest difference ${gap.toExponential(1)}). The same numbers, from two routes.`;
}
