import { Hint } from '../../components/ui';
import { MAX_CHARS, type Prepared } from './text';

/** What `prepare` did to the typed text: cut it at MAX_CHARS, or replaced control characters by a visible escape. */
export function PreparedNote({ prepared }: { prepared: Prepared }) {
  if (!prepared.truncated && prepared.escaped === 0) return null;
  return (
    <Hint tone="muted">
      {prepared.truncated ? `Only the first ${MAX_CHARS.toLocaleString('en-US')} characters are used. ` : ''}
      {prepared.escaped > 0
        ? `${prepared.escaped} control or lone-surrogate character${prepared.escaped === 1 ? '' : 's'} shown as a \\u escape, so the bytes stay the ones shown. Each escape counts as 6 characters here (a typed newline is \\u000a).`
        : ''}
    </Hint>
  );
}
