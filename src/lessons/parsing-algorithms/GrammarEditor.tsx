import { ChipButton, ControlGroup, Hint, TextArea, TextField } from '../../components/ui';
import { MAX_ALTERNATIVES, MAX_RULES, MAX_SYMBOLS, MAX_TOKEN_TEXT, type Analysis } from './grammar';
import { PRESETS } from './presets';
import { MAX_TOKENS } from './runs';
import type { GrammarInput, TokenInput } from './useGrammar';

const EDITOR_ROWS = 6;

/** Presets, the rule editor and its refusal, and the flags for names that are never defined or never reached. */
export function GrammarEditor({ input, analysis, onPreset }: { input: GrammarInput; analysis: Analysis; onPreset: (id: string) => void }) {
  return (
    <>
      <ControlGroup label="Grammar">
        {PRESETS.map((p) => (
          <ChipButton key={p.id} tone="info" on={input.presetId === p.id} onClick={() => onPreset(p.id)}>
            {p.label}
          </ChipButton>
        ))}
      </ControlGroup>
      <TextArea label={`Rules (up to ${MAX_RULES}, ${MAX_ALTERNATIVES} alternatives, ${MAX_SYMBOLS} symbols each; eps is empty)`} value={input.text} onChange={input.setText} rows={EDITOR_ROWS} />
      <Hint tone="muted" block>
        <span role="status" className="pa-status">
          {input.error ? <span className="pa-error">{input.error} The last good grammar stays.</span> : null}
          {analysis.undefinedNonterminals.map((n) => (
            <span key={n} className="pa-flag">
              {' '}
              <code>{n}</code> is never defined: any rule using it cannot derive a string.
            </span>
          ))}
          {analysis.unreachable.map((n) => (
            <span key={n} className="pa-flag">
              {' '}
              <code>{n}</code> is defined but the start symbol never reaches it.
            </span>
          ))}
        </span>
      </Hint>
    </>
  );
}

/** The token string field and its refusal. */
export function TokenField({ input }: { input: TokenInput }) {
  return (
    <>
      <TextField label={`Tokens (up to ${MAX_TOKENS}, separated by spaces)`} value={input.text} onChange={input.setText} width={260} spellCheck={false} maxLength={MAX_TOKEN_TEXT} />
      <Hint tone="muted" block>
        <span role="status" className="pa-status">
          {input.error ? <span className="pa-error">{input.error} The last good tokens stay.</span> : null}
        </span>
      </Hint>
    </>
  );
}
