import { useMemo, type ReactNode } from 'react';
import type { ArrayCellState } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { CharStrip, type Arrow } from './CharStrip';
import { parseFrames } from './frames';
import { parseControlRows } from './ParseControls';
import { showChar, tokenLength, parseLz77, type Token } from './lz77';
import type { ParseSettings } from './useParseSettings';

const STEP_MS = 700;

const tokenLabel = (t: Token) => (t.kind === 'literal' ? showChar(t.char) : `(${t.distance}, ${t.length})`);

export function TokensScene({ picker, s }: { picker: ReactNode; s: ParseSettings }) {
  const chars = useMemo(() => Array.from(s.text), [s.text]);
  const tokens = useMemo(() => parseLz77(s.text, { window: s.window, minMatch: s.minMatch }), [s.text, s.window, s.minMatch]);
  const frames = useMemo(() => parseFrames(s.text, tokens, { window: s.window, minMatch: s.minMatch }), [s.text, s.window, s.minMatch, tokens]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const cur = f.current;
  const emitted = tokens.slice(0, f.k);
  const matches = emitted.filter((t) => t.kind === 'match').length;
  const decisionAt = cur ? cur.pos : 0;
  const windowStart = Math.max(0, decisionAt - s.window);

  const tokenOwner = (i: number): Token | undefined => emitted.find((t) => i >= t.pos && i < t.pos + tokenLength(t));
  const inCurrent = (i: number) => !!cur && i >= cur.pos && i < cur.pos + tokenLength(cur);
  const source = cur && cur.kind === 'match' ? { from: cur.pos - cur.distance, to: cur.pos - cur.distance + cur.length - 1 } : null;
  const cellState = (i: number): ArrayCellState => {
    if (inCurrent(i)) return 'active';
    if (source && i >= source.from && i <= source.to && i < decisionAt) return 'violet';
    if (i < windowStart) return 'dim';
    return 'idle';
  };
  const cellTone = (i: number) => {
    const owner = tokenOwner(i);
    if (!owner) return null;
    return owner.kind === 'match' ? 'violet' : 'muted';
  };
  const arrows: Arrow[] = emitted.flatMap((t): Arrow[] => (t.kind === 'match' ? [{ from: t.pos - t.distance, to: t.pos, tone: t === cur ? 'hi' : 'violet' }] : []));

  return (
    <StageFrame
      player={player}
      height={240}
      stats={
        <Stats>
          <Stat label="Tokens" value={`${f.k} of ${tokens.length}`} color="var(--violet)" sub={`${matches} ${matches === 1 ? 'match' : 'matches'}, ${f.k - matches} ${f.k - matches === 1 ? 'literal' : 'literals'}`} />
          <Stat label="Characters covered" value={`${f.cursor} of ${chars.length}`} sub={cur ? `this token stands for ${tokenLength(cur)}` : 'nothing yet'} />
          <Stat label="Window" value={`${s.window} back`} color="var(--info)" sub={`minimum match ${s.minMatch}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the window', shape: 'square' },
            { color: 'var(--hi)', label: 'the token being decided', shape: 'square' },
            { color: 'var(--muted)', label: 'a literal', shape: 'square' },
            { color: 'var(--violet)', label: 'a back-reference and its source', shape: 'line' },
            { color: 'var(--dim)', label: 'beyond the window', shape: 'square' },
          ]}
        />
      }
      controls={[picker, ...parseControlRows(s)]}
    >
      <div className="lz-stage stage-pad">
        {chars.length === 0 ? (
          <p className="lz-empty">No characters yet.</p>
        ) : (
          <CharStrip
            values={chars.map(showChar)}
            cellState={cellState}
            cellTone={cellTone}
            ranges={decisionAt > windowStart ? [{ from: windowStart, to: decisionAt - 1, tone: 'info' }] : []}
            arrows={arrows}
            reveal={cur ? { from: Math.min(cur.pos, cur.pos - (cur.kind === 'match' ? cur.distance : 0)), to: cur.pos + tokenLength(cur) - 1 } : { from: 0, to: 0 }}
            ariaLabel={`The text, ${chars.length} characters, with ${matches} back-references so far`}
          />
        )}
        <div className="lz-tokens" aria-label="Token stream so far" role="list">
          {emitted.length === 0 && <Hint>The token stream builds here.</Hint>}
          {emitted.map((t, i) => (
            <span key={i} role="listitem" className={`lz-token is-${t.kind}${t === cur ? ' is-current' : ''}`}>
              {tokenLabel(t)}
            </span>
          ))}
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a greedy parser: it takes the longest match at each step, which real compressors improve on with lazy matching</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
