import { useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useAsyncValue } from '../../core/useAsyncValue';
import { aesCbcRawEncrypt } from '../../core/crypto';
import { BLOCK, ctrCrypt, randomBytes, xorBytes } from './ciphers';
import { HONESTY, reuseCaption } from './frames';
import { REUSE_TEXTS, ascii, blockIds } from './model';

type Bytes = Uint8Array<ArrayBuffer>;
type ReuseMode = 'CBC' | 'CTR';
const [M1, M2] = REUSE_TEXTS.map(ascii);

interface Pair {
  c1: Bytes;
  c2: Bytes;
}

async function encryptPair(key: Bytes, mode: ReuseMode, reuse: boolean): Promise<Pair | null> {
  const iv1 = randomBytes(16);
  const iv2 = reuse ? iv1 : randomBytes(16);
  const enc = mode === 'CBC' ? aesCbcRawEncrypt : ctrCrypt;
  const [c1, c2] = await Promise.all([enc(key, iv1, M1), enc(key, iv2, M2)]);
  return c1 && c2 ? { c1, c2 } : null;
}

/** Block indexes where the two ciphertexts are identical. */
const equalBlocks = (p: Pair) => {
  const a = blockIds(p.c1);
  const b = blockIds(p.c2);
  return a.flatMap((id, i) => (id === b[i] ? [i] : []));
};
const zeroBytes = (x: Uint8Array) => Array.from(x).flatMap((v, i) => (v === 0 ? [i] : []));

export function ReuseScene({ picker, aesKey }: { picker: ReactNode; aesKey: Bytes }) {
  const [mode, setMode] = useState<ReuseMode>('CBC');
  const [reuse, setReuse] = useState(true);
  const [round, setRound] = useState(0);
  const pair = useAsyncValue(() => encryptPair(aesKey, mode, reuse), `${mode}:${reuse}:${round}`, { keepPrevious: true });
  const same = pair ? equalBlocks(pair) : [];
  const sameBytes = same.flatMap((b) => Array.from({ length: BLOCK }, (_, k) => b * BLOCK + k));
  const xor = pair ? xorBytes(pair.c1, pair.c2) : null;
  const zeros = xor ? zeroBytes(xor) : [];

  // The caption follows the pair on screen, so its counts are always the ones drawn.
  useIntroCaption(pair ? reuseCaption(mode, reuse, same.length, zeros.length) : <>Encrypting two messages…</>, [pair]);

  const change = (m: ReuseMode, r: boolean) => {
    setMode(m);
    setReuse(r);
  };
  const ring = (idx: number[]) => idx.map((i) => ({ i, tone: 'bad' as const }));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Identical blocks" value={pair ? same.length : '–'} color={same.length ? 'var(--bad)' : undefined} />
          {mode === 'CTR' && <Stat label="00 bytes in C1 ⊕ C2" value={xor ? zeros.length : '–'} color={reuse && zeros.length ? 'var(--bad)' : undefined} sub={reuse ? 'where M1 and M2 match' : 'chance only'} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'plaintext' },
            { color: 'var(--violet)', label: 'ciphertext' },
            { color: 'var(--bad)', label: 'ring: a leak (identical block, or 00 where the messages match)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Mode" value={mode} onChange={(m) => change(m, reuse)} options={[{ value: 'CBC', label: 'CBC' }, { value: 'CTR', label: 'CTR' }]} />
          <Toggle label={mode === 'CBC' ? 'IV' : 'Nonce'} value={reuse} onChange={(r) => change(mode, r)} off="Fresh each time" on="Reused" />
          <Button onClick={() => setRound(round + 1)}>Encrypt again</Button>
        </>,
      ]}
    >
      <div className="stage-pad sc-reuse">
        <div className="sc-messages">
          {REUSE_TEXTS.map((t, i) => (
            <p key={t} className="sc-plain"><b>M{i + 1}</b> <code>{t}</code></p>
          ))}
        </div>
        {pair && (
          <div className="sc-grids">
            <div>
              <SectionTitle>C1 = {mode}(M1)</SectionTitle>
              <ByteGrid bytes={pair.c1} toneOf={() => 'violet'} highlight={ring(sameBytes)} ariaLabel="Ciphertext of message 1" />
            </div>
            <div>
              <SectionTitle>C2 = {mode}(M2)</SectionTitle>
              <ByteGrid bytes={pair.c2} toneOf={() => 'violet'} highlight={ring(sameBytes)} ariaLabel="Ciphertext of message 2" />
            </div>
            {mode === 'CTR' && xor && (
              <div>
                <SectionTitle>C1 ⊕ C2</SectionTitle>
                <ByteGrid bytes={xor} highlight={reuse ? ring(zeros) : []} ariaLabel="The two ciphertexts XORed together" />
              </div>
            )}
          </div>
        )}
        <p className="sc-muted">
          The fix: a fresh, unpredictable IV for every CBC message, and a nonce that never repeats under one key for CTR and GCM. A reused
          GCM nonce also breaks its authentication. {HONESTY}
        </p>
      </div>
    </StageFrame>
  );
}
