import type { CSSProperties } from 'react';
import { categorical } from '../../core/palette';
import { highlightSegments, type MatchHit, type Range, type Token } from './model';

const groupStyle = (n: number) => ({ '--c': categorical(n - 1) }) as CSSProperties;

/** The pattern as chips, each with its plain-English meaning. Hover or focus one to see what it matched. */
export function TokenList({ tokens, hovered, onHover }: { tokens: readonly Token[]; hovered: number | null; onHover: (i: number | null) => void }) {
  return (
    <ol className="rx-tokens" aria-label="What each part of the pattern means">
      {tokens.map((t, i) => {
        const cls = ['rx-token', t.group !== undefined && 'is-group', i === hovered && 'is-hovered', !t.explained && 'is-unexplained'].filter(Boolean).join(' ');
        return (
          <li key={`${t.start}-${t.text}`}>
            <button
              type="button"
              className={cls}
              style={t.group !== undefined ? groupStyle(t.group) : undefined}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
            >
              <code className="rx-chip">{t.text}</code>
              <span className="rx-meaning">{t.explained ? t.meaning : `${t.meaning} (not explained)`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The test text with every match in --hi, each capture group in its own colour, and the hovered token in --info. */
export function HighlightedText({ text, matches, hover }: { text: string; matches: readonly MatchHit[]; hover: readonly Range[] }) {
  return (
    <pre className="rx-text" aria-label="Test text with matches highlighted">
      {highlightSegments(text, matches, hover).map((s, i) => {
        if (s.caret) return <span key={i} className={`rx-caret is-${s.caret}`} aria-hidden="true" />;
        const cls = [s.match !== null && 'rx-match', s.group !== null && 'rx-group', s.hover && 'rx-hover'].filter(Boolean).join(' ');
        return (
          <span key={i} className={cls || undefined} style={s.group !== null ? groupStyle(s.group) : undefined}>
            {s.text}
          </span>
        );
      })}
    </pre>
  );
}

/** One row per match: where it starts, the whole match, then each group in its own colour. */
export function GroupsTable({ matches, groupCount, names }: { matches: readonly MatchHit[]; groupCount: number; names: readonly (string | null)[] }) {
  const cols = Array.from({ length: groupCount }, (_, k) => k + 1);
  return (
    <div className="rx-table-wrap">
      <table className="data-table rx-table">
        <thead>
          <tr>
            <th>#</th>
            <th>index</th>
            <th>match</th>
            {cols.map((n) => (
              <th key={n} style={groupStyle(n)} className="rx-col">
                {names[n - 1] ? `${n} ${names[n - 1]}` : `group ${n}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matches.map((m, k) => (
            <tr key={`${m.start}-${k}`}>
              <td>{k + 1}</td>
              <td>{m.start}</td>
              <td className="rx-cell-match">{m.text === '' ? '(empty)' : m.text}</td>
              {m.groups.map((g) => (
                <td key={g.n} style={groupStyle(g.n)} className="rx-col">
                  {g.text === null ? <span className="rx-none">not used</span> : g.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
