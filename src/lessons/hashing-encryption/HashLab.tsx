import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { hasSubtle, hexToBits, sha256Hex } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';

const useSha256 = (text: string) => useAsyncValue(() => sha256Hex(text), text);

const PARAGRAPH =
  'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.';

function tweakOneChar(s: string) {
  if (!s) return 'a';
  const i = Math.floor(s.length / 2);
  const c = s[i];
  const swapped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
  const next = swapped !== c ? swapped : c === 'x' ? 'y' : 'x';
  return s.slice(0, i) + next + s.slice(i + 1);
}

const charDiff = (a: string, b: string) => {
  let n = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
};

export function HashLab({ modePicker }: { modePicker: ReactNode }) {
  const [a, setA] = useState('hello world');
  const [b, setB] = useState('hello World');
  const ha = useSha256(a);
  const hb = useSha256(b);
  const setCaption = useSetCaption();

  const bitsA = ha ? hexToBits(ha) : null;
  const bitsB = hb ? hexToBits(hb) : null;
  const flipped = bitsA && bitsB ? bitsA.reduce((n, bit, i) => n + (bit !== bitsB[i] ? 1 : 0), 0) : null;
  const chars = charDiff(a, b);

  // Recomputed on every keystroke, so the caption updates in place (quiet) instead of fading each time.
  useEffect(() => {
    if (!hasSubtle()) {
      setCaption(<>This browser blocks Web Crypto here, so digests can't be computed. Open the app over localhost or HTTPS.</>);
      return;
    }
    if (flipped === null) return;
    if (a === b) {
      setCaption(
        <>
          Same input, <span className="hl ok">same digest</span>, every single time. That's what lets you compare hashes to
          check a file or a password.
        </>,
        { quiet: true },
      );
    } else {
      setCaption(
        <>
          The inputs differ by <b>{chars}</b> {chars === 1 ? 'character' : 'characters'}, yet{' '}
          <span className="hl bad">{flipped} of 256 bits</span> flipped ({Math.round((flipped / 256) * 100)}%). That's the{' '}
          <b>avalanche effect</b>: similar inputs give unrelated digests.
        </>,
        { quiet: true },
      );
    }
  }, [a, b, chars, flipped, setCaption]);

  return (
    <StageFrame minWidth={440}
      height={430}
      stats={
        <Stats>
          <Stat label="Input A" value={`${a.length} chars`} />
          <Stat label="Digest" value="256 bits" color="var(--info)" sub="always, any input size" />
          <Stat
            label="Bits flipped"
            value={flipped === null ? '·' : `${flipped}/256`}
            color={flipped ? 'var(--bad)' : 'var(--ok)'}
            sub="between A and B"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'bit = 1' },
            { color: 'var(--cell)', label: 'bit = 0' },
            { color: 'var(--bad)', label: 'differs from A' },
          ]}
        />
      }
      controls={
        <Controls>
          {modePicker}
          <Button onClick={() => setB(tweakOneChar(a))}>Change one letter</Button>
          <Button onClick={() => setB(a)}>Make B identical</Button>
          <Button
            onClick={() => {
              setA(PARAGRAPH);
              setB(PARAGRAPH.replace('foolishness,', 'foolishness'));
            }}
          >
            Hash a whole paragraph
          </Button>
        </Controls>
      }
    >
      <div className="he-lab">
        <div className="he-machine" aria-hidden="true">
          <span className="he-machine-in">any text, any length</span>
          <span className="he-arrow">⟶</span>
          <span className="he-funnel">SHA-256</span>
          <span className="he-arrow">⟶</span>
          <span className="he-machine-out">64 hex chars</span>
          <span className="he-noback">✗ no way back from digest to text</span>
        </div>
        <HashRow label="A" value={a} onChange={setA} hex={ha} bits={bitsA} />
        <HashRow label="B" value={b} onChange={setB} hex={hb} bits={bitsB} compare={bitsA} compareHex={ha} />
      </div>
    </StageFrame>
  );
}

function HashRow({
  label, value, onChange, hex, bits, compare, compareHex,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hex: string | null;
  bits: number[] | null;
  compare?: number[] | null;
  compareHex?: string | null;
}) {
  return (
    <div className="he-row">
      <label className="he-input">
        <span className="he-row-label">{label}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label={`Input ${label}`} />
      </label>
      <div className="he-out">
        <div className="he-bits" role="img" aria-label={`256-bit digest of input ${label}`}>
          {Array.from({ length: 256 }, (_, i) => {
            const bit = bits?.[i] ?? 0;
            const diff = compare && bits ? compare[i] !== bit : false;
            return (
              <i
                key={i}
                className={`he-bit ${bit ? 'on' : ''} ${diff ? 'diff' : ''}`}
                style={{ '--d': `${(i % 32) * 6 + Math.floor(i / 32) * 20}ms` } as CSSProperties}
              />
            );
          })}
        </div>
        <code className="he-hex">
          {hex
            ? [...hex].map((ch, i) => (
                <span key={i} className={compareHex && compareHex[i] !== ch ? 'diff' : ''}>
                  {ch}
                </span>
              ))
            : 'hashing…'}
        </code>
      </div>
    </div>
  );
}
