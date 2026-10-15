import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from '../../components/Bar';
import { BitStrip } from '../../components/BitStrip';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import type { Bit } from '../../core/bits';
import type { Tone } from '../../core/tone';
import { CODE_LENGTH_BOUNDS, CODE_SYMBOLS, LENGTH_PRESETS, RFC_LENGTHS, assignCodes, isPrefixFree, kraftOutOf256, kraftState, type KraftState } from './model';
import { canonicalCaption } from './text';

const FULL = 2 ** CODE_LENGTH_BOUNDS.max;
/** The Kraft bar spans 0 to this multiple of a complete code. */
const BAR_SPAN = 2;
const STATE_TONE: Record<KraftState, Tone> = { oversubscribed: 'bad', complete: 'ok', incomplete: 'orange' };
const STATE_WORD: Record<KraftState, string> = { oversubscribed: 'oversubscribed', complete: 'complete', incomplete: 'incomplete' };

const bitsOf = (code: string): Bit[] => Array.from(code, (c) => (c === '1' ? 1 : 0));

export function CanonicalScene({ picker }: { picker: ReactNode }) {
  const [lengths, setLengths] = useState<number[]>([...RFC_LENGTHS]);
  const sum = kraftOutOf256(lengths);
  const state = kraftState(lengths);
  const codes = assignCodes(lengths);
  const tone = STATE_TONE[state];

  return (
    <StageFrame
      height={340}
      intro={canonicalCaption(lengths)}
      introKey={[lengths]}
      stats={
        <Stats>
          <Stat label="Kraft sum" value={`${sum}/${FULL}`} color={`var(--${tone})`} sub={`sum of 2^-length: ${STATE_WORD[state]}`}>
            <Bar value={Math.min(sum / FULL, BAR_SPAN)} max={BAR_SPAN} tone={tone} marker={1} markLabel="1: a complete code" height={8} animate={false} ariaLabel={`Kraft sum ${sum} of ${FULL}`} />
          </Stat>
          <Stat label="Prefix code" value={codes ? (isPrefixFree(codes) ? 'yes' : 'no') : 'none'} color={codes ? 'var(--ok)' : 'var(--bad)'} sub={codes ? 'no code starts another' : 'the lengths are oversubscribed'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'oversubscribed (above 1): no prefix code', shape: 'square' },
            { color: 'var(--ok)', label: 'complete (exactly 1)', shape: 'square' },
            { color: 'var(--orange)', label: 'incomplete (below 1): code space unused', shape: 'square' },
            { color: 'var(--info)', label: 'an assigned code', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Lengths" inline>
            {LENGTH_PRESETS.map((p) => (
              <ChipButton key={p.id} tone={p.id === 'over' ? 'bad' : p.id === 'under' ? 'orange' : 'info'} on={p.lengths.every((l, i) => l === lengths[i])} onClick={() => setLengths([...p.lengths])}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <Hint key="hint">Set each symbol&apos;s code length from {CODE_LENGTH_BOUNDS.min} to {CODE_LENGTH_BOUNDS.max}. Only these {CODE_SYMBOLS.length} numbers need sending: the receiver rebuilds every code by the same rule, which is why DEFLATE ships lengths and not trees (the tree itself is in <Link to="/lesson/huffman-coding">Huffman coding</Link>).</Hint>,
      ]}
    >
      <div className="lz-stage stage-pad">
        <ul className="lz-lengths" aria-label="Code lengths">
          {CODE_SYMBOLS.map((sym, i) => (
            <li key={sym} className="lz-length-row">
              <Slider
                label={`${sym} length`}
                value={lengths[i]}
                min={CODE_LENGTH_BOUNDS.min}
                max={CODE_LENGTH_BOUNDS.max}
                onChange={(v) => setLengths(lengths.map((l, j) => (j === i ? v : l)))}
              />
              <span className="lz-code" aria-label={`${sym} code`}>
                {codes && codes[i] ? <BitStrip bits={bitsOf(codes[i]!)} size="sm" toneOf={() => 'info'} ariaLabel={`${sym} is ${codes[i]}`} /> : <span className="lz-nocode">no code</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the codes are assigned live by the canonical rule of RFC 1951 section 3.2.2, which the lesson checks against that section&apos;s worked example</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
