import { ChipButton, ControlGroup, Hint, TextField } from '../../components/ui';
import { MAX_PATTERN_CHARS, MAX_SUBJECT_CHARS } from '../../core/regex';
import type { RegexInput } from './useRegexInput';

const FIELD_ROOM = 60;

/** The pattern and subject fields with their refusals; `withSubject` false hides the subject for a scene that does not read one. */
export function RegexFields({ input, withSubject = true }: { input: RegexInput; withSubject?: boolean }) {
  return (
    <>
      <TextField label={`Pattern (up to ${MAX_PATTERN_CHARS})`} value={input.patternText} onChange={input.setPatternText} width={210} spellCheck={false} maxLength={FIELD_ROOM} />
      {withSubject && (
        <TextField label={`Subject (up to ${MAX_SUBJECT_CHARS})`} value={input.subjectText} onChange={input.setSubjectText} width={210} spellCheck={false} maxLength={FIELD_ROOM} />
      )}
      <Hint tone="muted" block>
        <span role="status" className="re-status">
          {input.patternError ? <span className="re-error">{input.patternError} The last good pattern stays: <code>{input.parsed.source}</code>.</span> : null}
          {input.subjectError ? <span className="re-error"> {input.subjectError} The last good subject stays.</span> : null}
        </span>
      </Hint>
    </>
  );
}

/** A row of preset chips, one per (pattern, subject) pair. */
export function PresetChips({ presets, input }: { presets: readonly { pattern: string; subject: string }[]; input: RegexInput }) {
  return (
    <ControlGroup label="Presets">
      {presets.map((p) => (
        <ChipButton key={`${p.pattern}/${p.subject}`} tone="info" on={input.patternText === p.pattern && input.subjectText === p.subject} onClick={() => input.load(p.pattern, p.subject)}>
          <code>{p.pattern}</code>
        </ChipButton>
      ))}
    </ControlGroup>
  );
}
