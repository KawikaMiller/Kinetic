import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { realCompressedSize } from './deflate';
import { parseControlRows } from './ParseControls';
import { TEXT_PRESETS, compress, huffmanOnlyBits, orderZeroBits, rawBits } from './model';
import { comparisonCaption, type Comparison } from './text';
import type { ParseSettings } from './useParseSettings';

const YOUR_TEXT = 'your text';

export function WhereScene({ picker, s }: { picker: ReactNode; s: ParseSettings }) {
  const [pick, setPick] = useState<string>(YOUR_TEXT);
  const sources = useMemo(() => [{ label: YOUR_TEXT, text: s.text }, ...TEXT_PRESETS.map((p) => ({ label: p.label, text: p.text }))], [s.text]);
  const rows = useMemo(
    () => sources.map((src): Comparison => ({
      label: src.label,
      raw: rawBits(src.text),
      huffman: huffmanOnlyBits(src.text),
      entropy: orderZeroBits(src.text),
      deflate: compress(src.text, { window: s.window, minMatch: s.minMatch }).block.totalBits,
      real: undefined,
    })),
    [sources, s.window, s.minMatch],
  );
  const reals = useAsyncValue(async () => ({ sizes: await Promise.all(sources.map((src) => realCompressedSize(src.text))) }), sources.map((x) => x.text).join('\u0000'));
  const shown = rows.map((r, i) => ({ ...r, real: reals ? reals.sizes[i] : undefined }));
  const chosen = shown.find((r) => r.label === pick) ?? shown[0];
  const beats = shown.filter((r) => r.raw > 0 && r.deflate < r.entropy - 1e-9).length;

  return (
    <StageFrame
      height={360}
      intro={comparisonCaption(chosen)}
      introKey={[chosen.label, chosen.raw, chosen.deflate, chosen.entropy, chosen.huffman]}
      stats={
        <Stats>
          <Stat label="Beats the order-0 bound" value={`${beats} of ${shown.length}`} color="var(--ok)" sub="texts where DEFLATE is under n × H" />
          <Stat label="Looking at" value={chosen.label} sub={`${chosen.raw / 8} characters`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'under the order-0 bound: repeats removed', shape: 'square' },
            { color: 'var(--bad)', label: 'larger than plain bytes', shape: 'square' },
            { color: 'var(--violet)', label: 'the order-0 bound', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Look at row" inline>
            {shown.map((r) => (
              <ChipButton key={r.label} tone="info" on={r.label === chosen.label} onClick={() => setPick(r.label)}>
                {r.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        ...parseControlRows(s),
      ]}
    >
      <div className="lz-stage stage-pad">
        <div className="lz-table-wrap">
          <table className="lz-table" aria-label="Sizes in bits by method">
            <thead>
              <tr>
                <th scope="col">text</th>
                <th scope="col">plain</th>
                <th scope="col">Huffman</th>
                <th scope="col">bound</th>
                <th scope="col">DEFLATE</th>
                <th scope="col">real</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const under = r.raw > 0 && r.deflate < r.entropy - 1e-9;
                const over = r.deflate > r.raw;
                return (
                  <tr key={r.label} className={r.label === chosen.label ? 'is-focus' : undefined}>
                    <th scope="row">{r.label}</th>
                    <td>{r.raw}</td>
                    <td>{r.huffman.toFixed(1)}</td>
                    <td className="lz-bound">{r.entropy.toFixed(1)}</td>
                    <td className={under ? 'lz-under' : over ? 'lz-over' : undefined}>{r.deflate}</td>
                    <td>{r.real === undefined ? '…' : r.real === null ? 'n/a' : `${r.real * 8}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="lz-notes">
          <li>
            Columns are bits: plain is 8 a character; Huffman is one code over the characters (its table not counted); bound is n × H; DEFLATE is our fixed-Huffman block; real is the browser&apos;s own compressor, in bits.
          </li>
          <li>
            LZ77 removes repeats and Huffman removes skew. <code>gzip</code> is DEFLATE with a header and a checksum around it <ClaimLabel kind="standard">RFC 1952</ClaimLabel>
          </li>
          <li>
            Snappy and LZ4 are LZ77-style byte matchers tuned for speed; zstd pairs LZ-style matching with an entropy stage <Provenance kind="from-memory">one-line summaries from memory, verify before quoting</Provenance>
          </li>
        </ul>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">plain, Huffman and order-0 are computed live; our DEFLATE is the fixed-Huffman block of the last scene; the last column is the browser&apos;s own compressor, in bits</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
