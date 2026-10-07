import { useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useAsyncValue } from '../../core/useAsyncValue';
import { BLOCK, cbcDecrypt, cbcEncrypt, ctrCrypt, gcmDecrypt, gcmEncrypt, randomBytes, type GcmOpen } from './ciphers';
import { HONESTY, tamperCaption } from './frames';
import { TAMPER_DEFAULT_BYTE, TAMPER_TEXT, ascii, changedBytes, readable } from './model';

type Bytes = Uint8Array<ArrayBuffer>;
const PLAIN = ascii(TAMPER_TEXT);
/** The bit that gets flipped in transit: the lowest bit of the chosen byte. */
const FLIP_MASK = 0x01;

interface Opened {
  cbc: Bytes;
  ctr: Bytes;
  gcm: GcmOpen;
}

async function sendAndOpen(key: Bytes, ivs: { cbc: Bytes; ctr: Bytes; gcm: Bytes }, byte: number, flip: boolean): Promise<Opened | null> {
  const [cbc, ctr, gcm] = await Promise.all([cbcEncrypt(key, ivs.cbc, PLAIN), ctrCrypt(key, ivs.ctr, PLAIN), gcmEncrypt(key, ivs.gcm, PLAIN)]);
  if (!cbc || !ctr || !gcm) return null;
  // The same ciphertext position, flipped in transit, in each mode.
  if (flip) for (const ct of [cbc, ctr, gcm]) ct[byte] ^= FLIP_MASK;
  const [cbcOut, ctrOut, gcmOut] = await Promise.all([cbcDecrypt(key, ivs.cbc, cbc), ctrCrypt(key, ivs.ctr, ctr), gcmDecrypt(key, ivs.gcm, gcm)]);
  return cbcOut && ctrOut && gcmOut ? { cbc: cbcOut, ctr: ctrOut, gcm: gcmOut } : null;
}

/** True when CBC's decrypt flipped exactly the same bit one block after the flipped byte. */
function nextBlockBitFlip(out: Uint8Array, byte: number): boolean {
  const next = byte + BLOCK;
  if (next >= PLAIN.length) return false;
  const inNext = changedBytes(PLAIN, out).filter((i) => Math.floor(i / BLOCK) === Math.floor(next / BLOCK));
  return inNext.length === 1 && inNext[0] === next && (out[next] ^ PLAIN[next]) === FLIP_MASK;
}

/** Decrypted text, each changed character marked. */
function Decrypted({ bytes }: { bytes: Uint8Array }) {
  const changed = new Set(changedBytes(PLAIN, bytes));
  const text = readable(bytes);
  return (
    <code className="sc-out">
      {[...text].map((ch, i) => (
        <span key={i} className={changed.has(i) ? 'is-changed' : undefined}>{ch}</span>
      ))}
    </code>
  );
}

export function TamperScene({ picker, aesKey }: { picker: ReactNode; aesKey: Bytes }) {
  const [ivs] = useState(() => ({ cbc: randomBytes(16), ctr: randomBytes(16), gcm: randomBytes(12) }));
  const [byte, setByte] = useState(TAMPER_DEFAULT_BYTE);
  const [flip, setFlip] = useState(true);
  const opened = useAsyncValue(() => sendAndOpen(aesKey, ivs, byte, flip), `${byte}:${flip}`, { keepPrevious: true });
  const result = opened && {
    cbcChanged: changedBytes(PLAIN, opened.cbc).length,
    cbcNextBitFlipped: nextBlockBitFlip(opened.cbc, byte),
    ctrChanged: changedBytes(PLAIN, opened.ctr).length,
    gcmRefused: !opened.gcm.ok,
  };

  useIntroCaption(result ? tamperCaption(flip, byte, result) : <>Encrypting…</>, [opened]);

  return (
    <StageFrame
      height={400}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the message (plaintext bytes)' },
            { color: 'var(--hi)', label: 'the byte flipped in transit' },
            { color: 'var(--bad)', label: 'silently changed on decrypt' },
            { color: 'var(--ok)', label: 'tampering detected' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="In transit" value={flip} onChange={setFlip} off="Untouched" on="One bit flipped" />
        </>,
      ]}
    >
      <div className="stage-pad sc-tamper">
        <div>
          <SectionTitle>Message · click the byte whose ciphertext gets flipped</SectionTitle>
          <ByteGrid
            bytes={PLAIN}
            ascii
            toneOf={() => 'info'}
            highlight={[{ i: byte, tone: 'hi' }]}
            onByteClick={setByte}
            ariaLabel="Message bytes: pick the position to flip in the ciphertext"
          />
        </div>
        {opened && (
          <div className="sc-cards">
            <Box className={`sc-card ${flip && result!.cbcChanged ? 'tone-bad' : ''}`}>
              <b>CBC decrypts to</b>
              <Decrypted bytes={opened.cbc} />
            </Box>
            <Box className={`sc-card ${flip && result!.ctrChanged ? 'tone-bad' : ''}`}>
              <b>CTR decrypts to</b>
              <Decrypted bytes={opened.ctr} />
            </Box>
            <Box className={`sc-card ${!opened.gcm.ok ? 'tone-ok' : ''}`}>
              <b>GCM decrypts to</b>
              {opened.gcm.ok ? <Decrypted bytes={opened.gcm.plain} /> : <p className="sc-refused">Refused: authentication failed, so the tampering was detected.</p>}
            </Box>
          </div>
        )}
        <p className="sc-advice">
          <span className="chip tone-ok">Use AES-GCM (or ChaCha20-Poly1305) with a fresh nonce</span>
        </p>
        <p className="sc-muted">
          Flips bit 0 of byte {byte}. Padding is left out of this picture; in real CBC, padding errors leak information too (padding
          oracles), one more reason to use authenticated encryption. {HONESTY}
        </p>
      </div>
    </StageFrame>
  );
}
