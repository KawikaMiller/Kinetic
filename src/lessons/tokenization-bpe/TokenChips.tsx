import type { Tone } from '../../core/tone';
import type { TokenView } from './view';

/** Chips cycle through these by position: plain categories, kept clear of the verdict colours and of the `bad` used for an unknown symbol. */
const CHIP_TONES: readonly Tone[] = ['amber', 'sky', 'orange', 'muted'];

/**
 * Tokens as chips, each with its id. A chip takes a plain category tone by its position (never `ok` or `bad`),
 * except an unknown symbol, which is `bad` (the costly side: the text was lost). In byte mode a chip also shows the
 * text its bytes spell, or says it is only part of a character.
 */
export function TokenChips({ views, ariaLabel }: { views: readonly TokenView[]; ariaLabel: string }) {
  if (views.length === 0) return <p className="tk-empty">No tokens: the text is empty.</p>;
  return (
    <ul className="tk-chips" aria-label={ariaLabel}>
      {views.map((v, i) => (
        <li key={i} className={`chip tk-chip tone-${v.unknown ? 'bad' : CHIP_TONES[i % CHIP_TONES.length]}`}>
          <span className="tk-chip-label">{v.label}</span>
          {v.text !== null && v.text !== v.label && <span className="tk-chip-text">{v.text}</span>}
          {v.partial && <span className="tk-chip-text">part of a character</span>}
          <span className="tk-chip-id">#{v.id}</span>
        </li>
      ))}
    </ul>
  );
}
