import { useMemo, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { ByteGrid } from '../../components/ByteGrid';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import type { Bit, BitGroup } from '../../core/bits';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import type { Tone } from '../../core/tone';
import { inflateRaw, realCompressedSize, streamsAvailable, type PartKind } from './deflate';
import { deflateFrames } from './frames';
import { parseControlRows } from './ParseControls';
import { DEFLATE_MIN_MATCH } from './lz77';
import { compress, orderZeroBits } from './model';
import { inflateStateOf, inflateText, sizeText, sizeVerdict } from './text';
import type { ParseSettings } from './useParseSettings';

const STEP_MS = 700;
const PART_TONE: Record<PartKind, Tone> = {
  header: 'info',
  literal: 'muted',
  length: 'violet',
  'length-extra': 'amber',
  distance: 'violet',
  'distance-extra': 'amber',
  end: 'info',
};
const PART_LABEL: Record<PartKind, string> = {
  header: 'header',
  literal: 'literal',
  length: 'length',
  'length-extra': 'extra',
  distance: 'distance',
  'distance-extra': 'extra',
  end: 'end',
};

export function DeflateScene({ picker, s }: { picker: ReactNode; s: ParseSettings }) {
  const c = useMemo(() => compress(s.text, { window: s.window, minMatch: s.minMatch }), [s.text, s.window, s.minMatch]);
  const frames = useMemo(() => deflateFrames(c.block, s.text), [c, s.text]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const item = c.block.items[f.item];
  const key = `${s.text}|${s.window}|${s.minMatch}`;
  const available = streamsAvailable();
  // Wrapped in an object so a pending answer (null) is not mistaken for a stream the browser refused.
  const inflated = useAsyncValue(async () => ({ text: available ? await inflateRaw(c.block.bytes) : null }), key);
  const real = useAsyncValue(async () => ({ size: await realCompressedSize(s.text) }), s.text);
  const inflate = inflateStateOf(available, inflated === null ? undefined : inflated.text, s.text);
  const verdict = sizeVerdict(s.text, c);
  const bound = orderZeroBits(s.text);
  const demoted = c.tokens.filter((t) => t.kind === 'match' && t.length < DEFLATE_MIN_MATCH).length;

  const bits: Bit[] = Array.from(item.bits, (b) => (b === '1' ? 1 : 0));
  const groups: BitGroup[] = [];
  let at = 0;
  for (const p of item.parts) {
    groups.push({ from: at, to: at + p.bits.length - 1, tone: PART_TONE[p.kind], label: PART_LABEL[p.kind] });
    at += p.bits.length;
  }
  const byteOf = (bit: number) => Math.floor(bit / 8);
  const lastByte = byteOf(f.bitsSoFar - 1);

  return (
    <StageFrame
      player={player}
      height={340}
      stats={
        <Stats>
          <Stat label="Block so far" value={`${f.bitsSoFar} bits`} color="var(--info)" sub={`of ${c.block.totalBits}`} />
          <Stat label="Whole block" value={sizeText(c.block.totalBits)} color={verdict.added ? 'var(--bad)' : 'var(--ok)'} sub={verdict.text} />
          <Stat label="Order-0 bound" value={`${bound.toFixed(1)} bits`} color="var(--violet)" sub="n × H, no repeats modelled" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'a literal code', shape: 'square' },
            { color: 'var(--violet)', label: 'a length or distance code', shape: 'square' },
            { color: 'var(--amber)', label: 'extra bits', shape: 'square' },
            { color: 'var(--info)', label: 'header, end of block, bytes written', shape: 'square' },
            { color: 'var(--hi)', label: 'the byte being filled', shape: 'square' },
          ]}
        />
      }
      controls={[picker, ...parseControlRows(s)]}
    >
      <div className="lz-stage stage-pad">
        <div className="lz-bits">
          <h4 className="lz-title">This step&apos;s bits, in stream order</h4>
          <BitStrip bits={bits} groups={groups} size="sm" toneOf={(i) => groups.find((g) => i >= g.from && i <= g.to)?.tone} ariaLabel={`Bits of this step: ${item.bits}`} />
          {demoted > 0 && (
            <Hint tone="muted" block>
              {demoted} {demoted === 1 ? 'match is' : 'matches are'} shorter than DEFLATE&apos;s minimum of {DEFLATE_MIN_MATCH}, so {demoted === 1 ? 'it goes' : 'they go'} out as literals.
            </Hint>
          )}
          <Hint tone="muted" block>
            Codes are written most significant bit first, extra bits least significant first, and bytes fill from the lowest bit.
          </Hint>
        </div>
        <div className="lz-bytes">
          <h4 className="lz-title">The bytes</h4>
          <ByteGrid
            bytes={c.block.bytes}
            perRow={8}
            toneOf={(i) => (i === lastByte ? 'hi' : i < lastByte ? 'info' : undefined)}
            ariaLabel={`The ${c.block.bytes.length} bytes of the block, ${lastByte + 1} filled so far`}
          />
        </div>
        <div className="lz-checks">
          <p className="lz-check" role="status">{inflateText(inflate)}</p>
          <p className="lz-check">
            {real === null
              ? 'Asking the browser’s own compressor…'
              : real.size === null
                ? 'No compressor stream in this browser.'
                : `The browser’s own compressor makes ${real.size} ${real.size === 1 ? 'byte' : 'bytes'} of the same text (real; dynamic blocks and a smarter parse, so it need not match ours and can win or lose on a short input).`}
          </p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">our fixed-Huffman block is a valid raw DEFLATE stream (the lesson&apos;s own checks decode it with a real inflate); the compressor that makes its tokens is a greedy toy</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
