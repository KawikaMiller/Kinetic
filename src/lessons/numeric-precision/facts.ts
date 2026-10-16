/** Numbers the try-this, key ideas and quiz quote, read off the models at the opening state or a named preset. */
import { read } from './cancellation';
import { dollars, makeCart, taxView } from './cart';
import { show, showError } from './captions';
import { OPENING, SUM_PRESETS } from './opening';
import { evaluate, generate, type MethodId } from './summation';

const run = (generator: Parameters<typeof generate>[0], n: number, precision: Parameters<typeof generate>[3]) => {
  const ev = evaluate(generate(generator, n, OPENING.summation.seed, precision).values, precision);
  const by = (id: MethodId) => ev.runs.find((r) => r.id === id)!;
  return { ev, by };
};

const open = OPENING.summation;
const dimes = run(open.generator, open.n, open.precision);
const million = SUM_PRESETS.find((p) => p.id === 'million-steps')!;
const f32 = run(million.generator, million.n, million.precision);
const f64 = run(million.generator, million.n, 'f64');
const blind = run('blind-spot', 4, 'f64');

const C = OPENING.cancellation;
const sqrt16 = read(C.id, C.k);
const sqrt8 = read('sqrt-difference', 8);
const quad8 = read('quadratic-root', 8);

const K = OPENING.cents;
const cart = makeCart(K.items, K.seed);
const view = (mode: 'half-up' | 'half-even' | 'truncate', granularity: 'line' | 'total', representation: 'float' | 'cents') => taxView(cart, K.bp, mode, granularity, representation);

export const FACTS = {
  dimesNaive: show(dimes.by('naive').result),
  dimesKahan: show(dimes.by('kahan').result),
  dimesExact: show(dimes.ev.exact),
  f32N: million.n,
  f32Naive: show(f32.by('naive').result),
  f32NaiveError: showError(f32.by('naive').error),
  f32NaiveUlps: Math.round(f32.by('naive').ulps ?? 0),
  f32Kahan: show(f32.by('kahan').result),
  f32KahanError: showError(f32.by('kahan').error),
  f64NaiveError: showError(f64.by('naive').error),
  f64KahanError: showError(f64.by('kahan').error),
  blindNaive: show(blind.by('naive').result),
  blindKahan: show(blind.by('kahan').result),
  blindNeumaier: show(blind.by('neumaier').result),
  blindExact: show(blind.ev.exact),
  k: C.k,
  sqrtNaiveDigits: sqrt16.naive.correct,
  sqrtStableDigits: sqrt16.stable.correct,
  sqrt8NaiveDigits: sqrt8.naive.correct,
  quad8NaiveDigits: quad8.naive.correct,
  items: K.items,
  rate: (K.bp / 100).toFixed(2),
  floatDriftHalfUp: view('half-up', 'line', 'float').drift,
  centsDriftHalfUp: view('half-up', 'line', 'cents').drift,
  floatDriftHalfEven: view('half-even', 'line', 'float').drift,
  floatDriftTruncate: view('truncate', 'line', 'float').drift,
  floatDriftTotal: view('half-up', 'total', 'float').drift,
  exactTax: dollars(view('half-up', 'line', 'cents').exact),
  addFact: String(0.1 + 0.2),
  toFixedFact: (1.005).toFixed(2),
  roundFact: Math.round(1.005 * 100),
};
