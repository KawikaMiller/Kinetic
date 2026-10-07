import { useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { ByteGrid } from '../../components/ByteGrid';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Segmented } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { toBits } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { aesCbcRawEncrypt, toHex } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { BLOCK, ctrCrypt, ecbEncrypt } from './ciphers';
import { HONESTY, bitDistance, chainCaption } from './frames';
import { ModeDiagram } from './ModeDiagram';
import { CHAIN_TEXT, ascii, changedBlocks, changedBytes, type ChainMode } from './model';

type Bytes = Uint8Array<ArrayBuffer>;
const MODES: ChainMode[] = ['ECB', 'CBC', 'CTR'];
const PLAIN = ascii(CHAIN_TEXT);
const BLOCKS = PLAIN.length / BLOCK;
const FIELDS = Array.from({ length: BLOCKS }, (_, i) => ({ from: i * BLOCK, to: i * BLOCK + BLOCK - 1, tone: 'info' as const, label: `block ${i + 1}` }));
const CIPHER_FIELDS = FIELDS.map((f) => ({ ...f, tone: 'violet' as const }));
/** A fixed IV / counter for this lane, so the only thing that changes is the flipped bit. */
const IV = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);

const run = (mode: ChainMode, key: Bytes, data: Bytes) =>
  mode === 'ECB' ? ecbEncrypt(key, data) : mode === 'CBC' ? aesCbcRawEncrypt(key, IV, data) : ctrCrypt(key, IV, data);

export function ChainScene({ picker, aesKey }: { picker: ReactNode; aesKey: Bytes }) {
  const [mode, setMode] = useState<ChainMode>('CBC');
  const [plain, setPlain] = useState<Bytes>(PLAIN);
  const [byte, setByte] = useState<number | null>(null);
  const setCaption = useSetCaption();
  const pair = useAsyncValue(
    async () => {
      const [before, after] = await Promise.all([run(mode, aesKey, PLAIN), run(mode, aesKey, plain)]);
      return before && after ? { before, after } : null;
    },
    `${mode}:${toHex(plain)}`,
    { keepPrevious: true },
  );
  const blocks = pair ? changedBlocks(pair.before, pair.after) : [];
  const bytes = pair ? changedBytes(pair.before, pair.after) : [];
  const flippedBytes = changedBytes(PLAIN, plain);

  useIntroCaption(chainCaption(mode, 0, [], 0));

  const caption = (m: ChainMode, p: Bytes) =>
    Promise.all([run(m, aesKey, PLAIN), run(m, aesKey, p)]).then(([x, y]) => {
      if (x && y) setCaption(chainCaption(m, bitDistance(PLAIN, p), changedBlocks(x, y), changedBytes(x, y).length));
    });
  const flip = (bit: number) => {
    if (byte === null) return;
    const next = plain.slice();
    next[byte] ^= 0x80 >> bit;
    setPlain(next);
    void caption(mode, next);
  };
  const changeMode = (m: ChainMode) => {
    setMode(m);
    void caption(m, plain);
  };
  const reset = () => {
    setPlain(PLAIN);
    setByte(null);
    setCaption(chainCaption(mode, 0, [], 0));
  };

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'plaintext bytes' },
            { color: 'var(--violet)', label: 'ciphertext bytes' },
            { color: 'var(--hi)', label: 'flipped / changed' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Mode" value={mode} onChange={changeMode} options={MODES.map((m) => ({ value: m, label: m }))} />
          <Button onClick={reset} disabled={flippedBytes.length === 0 && byte === null}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad sc-chain">
        <div className="sc-grids">
          <div>
            <SectionTitle>Plaintext · click a byte</SectionTitle>
            <ByteGrid
              bytes={plain}
              ascii
              fields={FIELDS}
              toneOf={(i) => (flippedBytes.includes(i) ? 'hi' : undefined)}
              highlight={byte === null ? [] : [{ i: byte, tone: 'hi' }]}
              onByteClick={setByte}
              ariaLabel="Plaintext bytes: pick one to flip its bits"
            />
          </div>
          <div>
            <SectionTitle>Ciphertext ({mode})</SectionTitle>
            {pair && (
              <ByteGrid bytes={pair.after} fields={CIPHER_FIELDS} toneOf={(i) => (bytes.includes(i) ? 'hi' : undefined)} ariaLabel={`${mode} ciphertext bytes`} />
            )}
          </div>
        </div>
        {byte !== null && (
          <div className="sc-bits">
            <SectionTitle>Byte {byte}: flip a bit</SectionTitle>
            <BitStrip
              bits={toBits(plain[byte], 8)}
              onToggle={flip}
              toneOf={() => 'info'}
              ariaLabelOf={(i) => `byte ${byte}, bit ${7 - i}`}
              size="sm"
            />
          </div>
        )}
        <WideRegion minWidth={560} label="Mode diagram: scroll sideways to see all of it">
          <ModeDiagram mode={mode} changed={blocks} flippedBlocks={[...new Set(flippedBytes.map((i) => Math.floor(i / BLOCK)))]} />
        </WideRegion>
        <p className="sc-muted">{HONESTY} This lane reuses one fixed IV so the flipped bit is the only difference; a real system never does that (see IV reuse).</p>
      </div>
    </StageFrame>
  );
}
