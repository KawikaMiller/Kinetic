import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, TextField, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { encryptFrames, group, type EncFrame } from './frames';
import { ModClock, type ClockMark } from './ModClock';
import { fixedPointCount, fixedPoints, parseMessage, repeatedCiphertexts, runItems, type Item, type MessageInput, type RsaKey } from './model';
import { KeyStats, ToyNote } from './Parts';

const STEP_MS = 1400;
const FALLBACK = [{ m: 2n }];
const PRESETS: MessageInput[] = [
  { mode: 'number', text: '65' },
  { mode: 'word', text: 'HELLO' },
  { mode: 'word', text: 'ABBA' },
];

function clockFor(f: EncFrame, items: readonly Item[]): { from: ClockMark | null; to: ClockMark | null; arrow: { label: string; tone: 'info' | 'violet' } | null } {
  const it = items[f.i];
  const m: ClockMark = { value: it.m, label: `m ${group(it.m)}`, tone: 'hi' };
  const c: ClockMark = { value: it.c, label: `c ${group(it.c)}`, tone: 'orange' };
  if (f.phase === 'start') return { from: m, to: null, arrow: null };
  if (f.phase === 'dec') return { from: c, to: { value: it.back, label: `m ${group(it.back)}`, tone: 'ok' }, arrow: { label: '^d mod n', tone: 'violet' } };
  return { from: m, to: c, arrow: { label: '^e mod n', tone: 'info' } };
}

export function EncryptScene({ picker, rsaKey }: { picker: ReactNode; rsaKey: RsaKey }) {
  const [input, setInput] = useState<MessageInput>({ mode: 'word', text: 'ABBA' });
  const [applied, setApplied] = useState<MessageInput>(input);
  const parsedApplied = parseMessage(applied, rsaKey.n);
  // A key change can make the applied message too big (a letter's code ≥ n): fall back to m = 2.
  const items = useMemo(() => {
    const parsed = parseMessage(applied, rsaKey.n);
    return runItems(rsaKey, parsed.ok ? parsed.value : FALLBACK);
  }, [applied, rsaKey]);
  const frames = useMemo(() => encryptFrames(rsaKey, items), [rsaKey, items]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const typed = parseMessage(input, rsaKey.n);
  const repeats = f.phase === 'done' ? repeatedCiphertexts(items).flat() : [];
  const clock = clockFor(f, items);
  const word = items.some((it) => it.ch !== undefined);

  const apply = (next = input) => {
    if (parseMessage(next, rsaKey.n).ok) setApplied(next);
  };
  const load = (p: MessageInput) => {
    setInput(p);
    apply(p);
  };

  return (
    <StageFrame
      player={player}
      height={380}
      stats={<KeyStats rsaKey={rsaKey} />}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'message m', shape: 'dot' },
            { color: 'var(--orange)', label: 'ciphertext c', shape: 'dot' },
            { color: 'var(--ok)', label: 'decrypted back', shape: 'dot' },
            { color: 'var(--info)', label: 'public e step', shape: 'line' },
            { color: 'var(--violet)', label: 'private d step', shape: 'line' },
            { color: 'var(--bad)', label: 'repeated ciphertext' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Message" value={input.mode === 'word'} onChange={(w) => setInput({ mode: w ? 'word' : 'number', text: input.text })} off="Number" on="Word" />
          <TextField label={input.mode === 'word' ? 'Word' : 'm'} value={input.text} onChange={(t) => setInput({ ...input, text: t })} onEnter={() => apply()} width={140} spellCheck={false} />
          <Button variant="primary" onClick={() => apply()} disabled={!typed.ok}>Encrypt</Button>
          {!typed.ok && <Hint className="rsa-error">{typed.error}</Hint>}
          {!parsedApplied.ok && <Hint className="rsa-error">The last message doesn't fit this key ({parsedApplied.error}) Showing m = 2.</Hint>}
        </>,
        <ControlGroup key="p" label="Try">
          {PRESETS.map((p) => (
            <ChipButton key={p.text} on={applied.mode === p.mode && applied.text === p.text} onClick={() => load(p)}>
              {p.mode === 'word' ? `"${p.text}"` : `m = ${p.text}`}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad rsa-enc">
        <div className="rsa-enc-row">
          <ModClock n={rsaKey.n} {...clock} />
          <table className="data-table rsa-table rsa-items">
            <thead>
              <tr>
                {word && <th>char</th>}
                <th>m</th>
                <th>c = mᵉ mod n</th>
                <th>cᵈ mod n</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const now = (f.phase === 'enc' || f.phase === 'dec') && f.i === i;
                return (
                  <tr key={i} className={now ? 'is-now' : ''}>
                    {word && <td>"{it.ch}"</td>}
                    <td className="tone-hi rsa-val">{group(it.m)}</td>
                    <td className={`rsa-val ${repeats.includes(i) ? 'is-repeat' : 'tone-orange'}`}>{i < f.encrypted ? group(it.c) : '·'}</td>
                    <td className="rsa-val tone-ok">{i < f.decrypted ? group(it.back) : '·'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Box className="rsa-pitfalls">
          <b>Textbook RSA pitfalls</b>
          <ul>
            <li><b>Deterministic:</b> the same m always gives the same c, so repeats show, and anyone can test a guess by encrypting it with the public key. Real RSA pads every message with fresh randomness (OAEP).</li>
            <li><b>Some messages aren't hidden at all:</b> {group(fixedPointCount(rsaKey))} messages encrypt to themselves under this key, including {fixedPoints(rsaKey).map((v) => group(v)).join(', ')}.</li>
            <li>The real thing, RSA-OAEP with a 2048-bit key, runs in the Hashing & Encryption lesson's asymmetric lane.</li>
          </ul>
        </Box>
        <ToyNote />
      </div>
    </StageFrame>
  );
}
