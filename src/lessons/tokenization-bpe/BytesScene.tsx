import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { TokenChips } from './TokenChips';
import { bytesCaption } from './captions';
import type { Mode } from './bpe';
import { SENTENCES } from './corpus';
import { bytesOpening } from './openings';
import { MAX_CHARS, prepare } from './text';
import { byteLength, paragraphTokenizer, tokenViews } from './view';

const MODES: { value: Mode; label: string }[] = [
  { value: 'chars', label: 'Characters' },
  { value: 'bytes', label: 'UTF-8 bytes' },
];
const EXAMPLES = ['café', '🙂', '日本語', 'naïve résumé'] as const;

export function BytesScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>(bytesOpening().mode);
  const [typed, setTyped] = useState(bytesOpening().text);
  const tokenizer = paragraphTokenizer(mode);
  const prepared = prepare(typed);
  const views = useMemo(() => tokenViews(tokenizer, tokenizer.encode(prepared.text)), [tokenizer, prepared.text]);
  const characters = Array.from(prepared.text).length;
  const bytes = byteLength(prepared.text);
  const unknown = views.filter((v) => v.unknown).length;
  const rows = useMemo(
    () =>
      SENTENCES.map((s) => ({
        ...s,
        characters: Array.from(s.text).length,
        bytes: byteLength(s.text),
        chars: paragraphTokenizer('chars').encode(s.text),
        byteTokens: paragraphTokenizer('bytes').encode(s.text),
      })),
    [],
  );

  return (
    <StageFrame
      height={500}
      intro={bytesCaption(mode, views, characters, bytes)}
      introKey={[mode, prepared.text]}
      stats={
        <Stats>
          <Stat label="Characters" value={characters} sub={`${bytes} UTF-8 bytes`} />
          <Stat label="Tokens" value={views.length} sub={mode === 'chars' ? 'character alphabet' : 'byte alphabet'} />
          <Stat label="Unknown" value={mode === 'chars' ? unknown : 0} color={mode === 'chars' && unknown > 0 ? 'var(--bad)' : undefined} sub={mode === 'chars' ? '<unk> tokens' : 'every byte has a symbol'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: '<unk>: the text it stood for is lost', shape: 'square' },
            { color: 'var(--violet)', label: 'raw bytes shown in hex, with the text they spell', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Base alphabet" options={MODES} value={mode} onChange={setMode} />
        </>,
        <>
          <TextField label="Text" value={typed} onChange={setTyped} width={220} spellCheck={false} />
          <ControlGroup label="Try" inline>
            {EXAMPLES.map((e) => (
              <ChipButton key={e} tone="muted" onClick={() => setTyped(e)}>{e}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="tk-stage stage-pad">
        <TokenChips views={views} ariaLabel="Tokens of the typed text" />
        {(prepared.truncated || prepared.escaped > 0) && (
          <Hint tone="muted">
            {prepared.truncated ? `Only the first ${MAX_CHARS.toLocaleString('en-US')} characters are used. ` : ''}
            {prepared.escaped > 0 ? `${prepared.escaped} control or lone-surrogate character${prepared.escaped === 1 ? '' : 's'} shown as a \\u escape, so the bytes stay the ones shown.` : ''}
          </Hint>
        )}
        <table className="data-table tk-table table-cards">
          <caption className="sr-only">The same sentence in three languages, tokenized by a toy that has only seen English</caption>
          <thead>
            <tr><th>language</th><th>sentence</th><th>characters</th><th>UTF-8 bytes</th><th>tokens, characters</th><th>tokens, bytes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.language}>
                <td data-label="language">{r.language}</td>
                <td data-label="sentence">{r.text}</td>
                <td data-label="characters">{r.characters}</td>
                <td data-label="UTF-8 bytes">{r.bytes}</td>
                <td data-label="tokens, characters">{r.chars.length}{r.chars.includes('<unk>') ? ` (${r.chars.filter((t) => t === '<unk>').length} unknown)` : ''}</td>
                <td data-label="tokens, bytes">{r.byteTokens.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tk-note">
          In this toy the non-English sentences need many more tokens, because the corpus was English; real tokenizers differ, so check the one you use.
        </p>
        <ProvenanceRow>
          <Provenance kind="toy">learned on an English paragraph only; the sentences are authored for this lesson</Provenance>
          <Provenance kind="real">UTF-8 bytes come from the browser&apos;s TextEncoder</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
