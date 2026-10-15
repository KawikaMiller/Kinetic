import type { Tone } from '../../core/tone';
import type { Path, Term } from './term';

/** Binders cycle through these hues; a bound variable takes its binder's, a free one is muted. Orange is kept for renamed names. */
export const BINDER_TONES: readonly Tone[] = ['sky', 'amber', 'pink', 'violet'];

/** The tone of every binder and variable node, keyed by address. */
export function tonesOf(t: Term): Map<Path, Tone> {
  const out = new Map<Path, Tone>();
  let count = 0;
  const walk = (node: Term, path: Path, env: ReadonlyMap<string, Tone>) => {
    if (node.k === 'v') out.set(path, env.get(node.name) ?? 'muted');
    else if (node.k === 'a') {
      walk(node.fn, `${path}f`, env);
      walk(node.arg, `${path}a`, env);
    } else {
      const tone = BINDER_TONES[count++ % BINDER_TONES.length];
      out.set(path, tone);
      walk(node.body, `${path}b`, new Map(env).set(node.param, tone));
    }
  };
  walk(t, '', new Map());
  return out;
}

