import { Button, ChipButton, Hint, TextField } from '../../components/ui';
import { refocusAfterRemove } from '../../core/refocus';
import { DEFAULT_PATTERNS, MAX_LETTERS, MAX_PATTERNS } from './model';
import type { PatternState } from './usePatterns';

const SECOND_PATTERNS: readonly string[] = ['a', 'ab', 'bab', 'bc', 'bca', 'c'];
const PRESETS: { id: string; label: string; patterns: readonly string[] }[] = [
  { id: 'he', label: 'he, she, his, hers', patterns: DEFAULT_PATTERNS },
  { id: 'abc', label: 'a, ab, bab, bc, bca, c', patterns: SECOND_PATTERNS },
];

/** Pattern chips (each removes itself), an add field and the presets. `note` is the line shown when nothing was refused. */
export function PatternEditor({ state, note }: { state: PatternState; note?: string }) {
  const letters = state.patterns.reduce((sum, p) => sum + p.length, 0);
  return (
    <>
      <span className="ac-patterns" role="group" aria-label="Patterns">
        {state.patterns.map((p, i) => (
          <ChipButton
            key={p}
            tone="info"
            ariaLabel={`Remove pattern ${p}`}
            onClick={(e) => {
              refocusAfterRemove(e.currentTarget, { group: '.ac-patterns', items: 'button', fallback: '.ac-add input' });
              state.remove(i);
            }}
          >
            {p} ×
          </ChipButton>
        ))}
      </span>
      <span className="ac-add">
        <TextField label="Add a pattern" value={state.draft} onChange={state.setDraft} onEnter={state.add} width={120} spellCheck={false} />
      </span>
      <Button onClick={state.add}>Add</Button>
      {PRESETS.map((p) => (
        <ChipButton key={p.id} tone="violet" on={state.patterns.join() === p.patterns.join()} onClick={() => state.load(p.patterns)}>{p.label}</ChipButton>
      ))}
      <Hint tone={state.error ? 'bad' : 'faint'}>
        <span role="status">
          {state.error ?? note ?? `${state.patterns.length} of ${MAX_PATTERNS} patterns, ${letters} of ${MAX_LETTERS} letters. States are renumbered after every edit.`}
        </span>
      </Hint>
    </>
  );
}
