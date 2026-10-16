/** Captions and stat text, every number taken from the model on screen. Plain strings, so tests can read them. */
import type { Comparison, CompareFn } from './compare';
import { MAX_GUESS_BYTES } from './compare';
import { LEAK_CLASSES, classVerdict, openClasses, type MitigationId } from './mitigations';
import { delta, meanTime, samplesNeeded, type NoiseSetting } from './noise';
import { eventText, type Verdict } from './traces';

export const n = (v: number) => v.toLocaleString('en-US');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

export const HONESTY_LINE = 'Every time on this page is simulated from a seeded noise model, and the secret is a fake. Nothing here measures or probes anything real.';

export const COMPARE_INTRO = 'Two comparison functions run on a fake token, each with a counter inside the real code. Type a guess and step through the bytes each one visits.';

const showByte = (b: number | undefined) => (b === undefined ? '?' : b >= 0x20 && b < 0x7f ? `'${String.fromCharCode(b)}'` : `0x${b.toString(16).padStart(2, '0')}`);

export function lengthMismatchCaption(guessBytes: number, secretBytes: number): string {
  return `Length check: the guess is ${plural(guessBytes, 'byte')} and the token ${plural(secretBytes, 'byte')}, so both functions return false before comparing a single byte (0 byte comparisons). Comparing lengths first is normal for fixed-length tokens; a variable-length secret needs a digest comparison instead.`;
}

export function byteStepCaption(fn: CompareFn, k: number, secret: readonly number[], guess: readonly number[], c: Comparison): string {
  const i = c.visited[k];
  const same = secret[i] === guess[i];
  const compared = `Byte ${n(i + 1)}: ${showByte(guess[i])} against ${showByte(secret[i])}`;
  const so = `${plural(k + 1, 'comparison')} so far`;
  const last = k === c.visited.length - 1;
  if (fn === 'early') {
    if (same) return last ? `${compared}: match. All ${n(secret.length)} bytes agree, ${so}, and the function returns true.` : `${compared}: match, keep going (${so}).`;
    const skipped = secret.length - c.visited.length;
    const left = skipped === 0 ? 'it was the last byte' : `${plural(skipped, 'byte')} ${skipped === 1 ? 'is' : 'are'} never visited`;
    return `${compared}: mismatch. The function returns false here, ${so}; ${left}. The count told an observer how far the guess matched.`;
  }
  const carry = same ? 'equal, nothing recorded' : 'different, OR-ed into the accumulator';
  return last
    ? `${compared}: ${carry}. All ${n(secret.length)} bytes visited (${so}); the accumulator is tested once and the answer is ${c.equal ? 'true' : 'false'}.`
    : `${compared}: ${carry}. The loop carries on either way (${so}).`;
}

export function compareSummary(secret: readonly number[], guess: readonly number[], early: Comparison, constant: Comparison): string {
  if (early.lengthMismatch) return lengthMismatchCaption(guess.length, secret.length);
  return `Early exit executed ${plural(early.comparisons, 'comparison')}; constant time executed ${plural(constant.comparisons, 'comparison')} (${n(secret.length)} bytes). Both answered ${early.equal ? 'true' : 'false'}.`;
}

export const guessLimitNote = `A guess is up to ${MAX_GUESS_BYTES} UTF-8 bytes; the token has ${MAX_GUESS_BYTES}.`;

export function noiseCaption(s: NoiseSetting): string {
  const need = samplesNeeded(s);
  const quieter = samplesNeeded({ ...s, sigma: Math.max(1, s.sigma / 2) });
  return `One more byte comparison adds ${plural(delta(s), 'time unit')} on average (${n(meanTime(s, 1))} against ${n(meanTime(s, 2))}); the noise has a standard deviation of ${n(s.sigma)}. About ${plural(need, 'repeated observation')} per case separate the two at about 95% confidence and 80% power; halve the noise and it is ${n(quieter)}. Noise raises the cost of an observer; it does not remove the difference.`;
}

export function verdictCaption(v: Verdict, programLabel: string): string {
  if (!v.leaks) return `${programLabel}: the two traces are identical in this model, so an observer of the branches and lines would learn nothing from this pair. One pair is not a proof: another pair might differ.`;
  const at = v.firstDifference!;
  const a = v.traceA[at];
  const b = v.traceB[at];
  return `${programLabel}: the traces differ at event ${n(at + 1)} (${a ? eventText(a) : 'the trace ends'} against ${b ? eventText(b) : 'the trace ends'}), so what an observer sees depends on the secret: it leaks.`;
}

export function mitigationCaption(enabled: readonly MitigationId[]): string {
  const open = openClasses(enabled);
  const covered = LEAK_CLASSES.filter((c) => classVerdict(enabled, c.id) === 'covered').length;
  const partly = LEAK_CLASSES.filter((c) => classVerdict(enabled, c.id) === 'partly').length;
  const head = `${plural(enabled.length, 'mitigation')} on: ${n(covered)} of ${n(LEAK_CLASSES.length)} classes covered, ${n(partly)} partly, ${n(open.length)} open.`;
  return open.length === 0 ? `${head} In this table nothing is left open, which says nothing about leak classes the table does not list.` : `${head} A class marked open is addressed by none of the mitigations switched on.`;
}
