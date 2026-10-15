import { NA } from '../../core/format';

type ValueState = 'plain' | 'hi' | 'ok' | 'struck' | 'minimal' | 'bad';

/** An array drawn as a row of value chips; `state` colours the whole row. */
export function Values({ xs, state = 'plain', label }: { xs: readonly number[]; state?: ValueState; label: string }) {
  return (
    <span className={`pbt-values is-${state}`} role="group" aria-label={`${label}: ${xs.length === 0 ? 'empty' : xs.join(', ')}`}>
      {xs.length === 0 ? <i className="pbt-empty">{NA} empty</i> : xs.map((v, i) => <b key={i}>{v}</b>)}
    </span>
  );
}
