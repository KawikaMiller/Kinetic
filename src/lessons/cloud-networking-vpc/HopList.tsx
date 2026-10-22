import type { Hop } from './vpc';

const WORD: Record<Hop['verdict'], string> = { pass: 'passed', drop: 'dropped', info: 'note' };

/** The checks made so far, newest last. The word beside each one is the verdict, so colour is never the only cue. */
export function HopList({ hops, shown, label }: { hops: Hop[]; shown: number; label: string }) {
  const revealed = hops.slice(0, shown);
  if (revealed.length === 0) return <p className="vpc-note">No check has happened yet.</p>;
  return (
    <ol className="vpc-hops" aria-label={label}>
      {revealed.map((h, i) => (
        <li key={i} className={`vpc-hop is-${h.verdict}${i === revealed.length - 1 ? ' is-current' : ''}`} aria-current={i === revealed.length - 1 ? 'step' : undefined}>
          <span className="vpc-hop-word">{WORD[h.verdict]}</span>
          <span className="vpc-hop-body">
            <b>{h.leg === 'reply' ? 'reply: ' : ''}{h.title}</b>
            <span>{h.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
