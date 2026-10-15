import { useMemo, useState, type ReactNode } from 'react';
import type { ArrayCellState } from '../../components/ArrayStrip';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { CharStrip } from './CharStrip';
import { DECODER_CODE, decodeFrames, type DecodeMode } from './frames';
import { parseControlRows } from './ParseControls';
import { showChar, parseLz77, type Token } from './lz77';
import type { ParseSettings } from './useParseSettings';

const STEP_MS = 450;
const NOT_WRITTEN = '';

const tokenLabel = (t: Token) => (t.kind === 'literal' ? showChar(t.char) : `(${t.distance}, ${t.length})`);

export function DecodeScene({ picker, s }: { picker: ReactNode; s: ParseSettings }) {
  const [mode, setMode] = useState<DecodeMode>('byte');
  const chars = useMemo(() => Array.from(s.text), [s.text]);
  const tokens = useMemo(() => parseLz77(s.text, { window: s.window, minMatch: s.minMatch }), [s.text, s.window, s.minMatch]);
  const frames = useMemo(() => decodeFrames(tokens, s.text, mode), [tokens, s.text, mode]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const written = Array.from(f.out);
  const wrong = f.done && f.out !== s.text;
  const starts = tokens.map((t) => t.pos);
  const decoding = f.token >= 0 ? tokens[f.token] : null;
  const justWrote = written.length - 1;
  const copied = decoding && decoding.kind === 'match';

  const cellState = (i: number): ArrayCellState => {
    if (f.read === i) return f.readOwn ? 'violet' : 'info';
    if (i >= written.length) return wrong ? 'bad' : 'dim';
    if (i === justWrote && f.token >= 0) return 'active';
    return 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={340}
      stats={
        <Stats>
          <Stat label="Decoded so far" value={`${written.length} of ${chars.length}`} sub={f.done ? undefined : `token ${Math.max(f.token + 1, 0)} of ${tokens.length}`} />
          <Stat label="Copy style" value={mode === 'byte' ? 'one at a time' : 'as a block'} color="var(--violet)" sub={mode === 'byte' ? 'a match may read its own output' : 'one slice of what exists'} />
          <Stat
            label="Result"
            value={!f.done ? '–' : wrong ? 'wrong' : 'matches'}
            color={f.done ? (wrong ? 'var(--bad)' : 'var(--ok)') : undefined}
            sub={f.done ? (wrong ? `${written.length} of ${chars.length} characters` : 'identical to the original') : 'step to the end to see it'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the character just written', shape: 'square' },
            { color: 'var(--info)', label: 'the character read from the output', shape: 'square' },
            { color: 'var(--violet)', label: 'read from this copy’s own output', shape: 'square' },
            { color: 'var(--dim)', label: 'not written yet', shape: 'square' },
            { color: 'var(--bad)', label: 'never written (wrong decoder)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Copy" value={mode === 'block'} onChange={(on) => setMode(on ? 'block' : 'byte')} off="One character at a time" on="As a block" />
        </>,
        ...parseControlRows(s),
      ]}
    >
      <div className="lz-stage stage-pad">
        {chars.length === 0 ? (
          <p className="lz-empty">No characters yet.</p>
        ) : (
          <CharStrip
            values={chars.map((_, i) => (i < written.length ? showChar(written[i]) : NOT_WRITTEN))}
            cellState={cellState}
            reveal={{ from: Math.max(0, Math.min(written.length - 1, chars.length - 1)), to: Math.min(written.length, chars.length - 1) }}
            ariaLabel={`The decoded text, ${written.length} of ${chars.length} characters written`}
          />
        )}
        <div className="lz-decode-row">
          <div className="lz-tokens" role="list" aria-label="Tokens to decode">
            {tokens.map((t, i) => (
              <span key={starts[i]} role="listitem" className={`lz-token is-${t.kind}${i === f.token ? ' is-current' : ''}${i > f.token ? ' is-later' : ''}`}>
                {tokenLabel(t)}
              </span>
            ))}
          </div>
          <CodePanel title={mode === 'byte' ? 'decoder (right)' : 'decoder (wrong for overlaps)'} lines={DECODER_CODE[mode]} active={f.token >= 0 ? f.line : undefined} />
        </div>
        {copied && decoding.length > decoding.distance && (
          <Hint tone="muted" block>
            This match is {decoding.length} long but only {decoding.distance} back:{' '}
            {mode === 'byte' ? 'its later characters come from characters this same copy has only just written.' : 'a slice can only reach the end of what exists, so the rest of the copy is lost.'}
          </Hint>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the decoder runs live on the tokens; the block copy is the usual wrong implementation, shown on purpose</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
