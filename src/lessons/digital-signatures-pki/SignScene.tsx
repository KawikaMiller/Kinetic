import { useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats, TextArea } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { ecdsaKeyPair, ecdsaSign, ecdsaVerify, enc, toHex } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { HONESTY, signCaption } from './frames';

type Bytes = Uint8Array<ArrayBuffer>;
const DEFAULT_NOTE = 'Release v2.4.1: fixes the login timeout. Build 7f3c.';
const NOTE_MAX = 300;

interface Signed {
  text: string;
  sig: Bytes;
}

export function SignScene({ picker }: { picker: ReactNode }) {
  const [round, setRound] = useState(0);
  const pair = useAsyncValue(async () => {
    const k = await ecdsaKeyPair();
    return k ? { keys: k, pub: new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)) } : null;
  }, round);
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [signed, setSigned] = useState<Signed | null>(null);
  const [flipped, setFlipped] = useState<number[]>([]);

  const sigNow = signed ? Uint8Array.from(signed.sig, (b, i) => (flipped.includes(i) ? b ^ 0x01 : b)) : null;
  const verified = useAsyncValue(
    async () => (pair && sigNow ? ecdsaVerify(pair.keys.publicKey, sigNow, enc.encode(note)) : null),
    `${round}:${note}:${sigNow ? toHex(sigNow) : ''}`,
    { keepPrevious: true },
  );
  const noteEdited = signed !== null && note !== signed.text;
  const state = !signed ? 'unsigned' : verified ? 'valid' : noteEdited && flipped.length ? 'both' : noteEdited ? 'note-edited' : 'sig-edited';
  useIntroCaption(signCaption(state), [state]);

  const sign = async () => {
    if (!pair) return;
    const sig = await ecdsaSign(pair.keys.privateKey, enc.encode(note));
    if (sig) {
      setSigned({ text: note, sig });
      setFlipped([]);
    }
  };
  const toggleByte = (i: number) => setFlipped(flipped.includes(i) ? flipped.filter((x) => x !== i) : [...flipped, i]);
  const newKeys = () => {
    setRound(round + 1);
    setSigned(null);
    setFlipped([]);
  };

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Verify" value={!signed ? '–' : verified ? 'valid' : 'invalid'} color={!signed ? undefined : verified ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Key" value="ECDSA P-256" sub="real WebCrypto" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'private key 🔒 and the signature it makes' },
            { color: 'var(--info)', label: 'public key' },
            { color: 'var(--hi)', label: 'a signature byte you flipped' },
            { color: 'var(--ok)', label: 'verifies' },
            { color: 'var(--bad)', label: 'fails' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => void sign()} disabled={!pair || note.length > NOTE_MAX}>Sign</Button>
          <Button onClick={newKeys}>New key pair</Button>
        </>,
      ]}
    >
      <div className="stage-pad dsp-sign">
        {!pair ? (
          <p className="dsp-muted">Generating a key pair… (this needs Web Crypto: https or localhost)</p>
        ) : (
          <>
            <TextArea label="Release note" value={note} onChange={setNote} rows={2} mono={false} />
            {note.length > NOTE_MAX && <Hint className="dsp-error">Keep the note under {NOTE_MAX} characters.</Hint>}
            {noteEdited && <p className="dsp-muted">Signed text: <q className="dsp-signed">{signed!.text}</q></p>}
            <div className="dsp-keys">
              <Box className="dsp-key tone-violet">
                <SectionTitle>Private key 🔒</SectionTitle>
                <p>{pair.keys.privateKey.extractable ? 'Extractable.' : "Non-extractable: it signs inside the browser and can't be read, even by this page."}</p>
              </Box>
              <Box className="dsp-key tone-info">
                <SectionTitle>Public key (65 bytes, shareable)</SectionTitle>
                <ByteGrid bytes={pair.pub} toneOf={() => 'info'} ariaLabel="Public key bytes" />
              </Box>
            </div>
            {sigNow && (
              <Box className={`dsp-key ${verified ? 'tone-ok' : 'tone-bad'}`}>
                <SectionTitle>Signature (64 bytes, r ‖ s) · click a byte to flip it</SectionTitle>
                <ByteGrid
                  bytes={sigNow}
                  toneOf={(i) => (flipped.includes(i) ? 'hi' : 'violet')}
                  onByteClick={toggleByte}
                  ariaLabel="Signature bytes: pick one to flip a bit"
                />
              </Box>
            )}
            <table className="data-table dsp-table">
              <thead>
                <tr><th>With</th><th>Who can check</th><th>Who can make one</th></tr>
              </thead>
              <tbody>
                <tr><td>HMAC (one shared key)</td><td>key holders</td><td>every verifier too: they hold the same key</td></tr>
                <tr><td>Signature (key pair)</td><td>anyone with the public key</td><td>only the private key holder</td></tr>
              </tbody>
            </table>
            <p className="dsp-muted">
              Sign the same note twice: here the signature changes every time, because ECDSA mixes in a secret random number per signature, and both verify. Reusing that number would expose the private key, which is why RFC 6979 derives it deterministically from the key and the message. {HONESTY}
            </p>
          </>
        )}
      </div>
    </StageFrame>
  );
}
