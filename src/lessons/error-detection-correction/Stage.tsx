import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { toBits, type Bit } from '../../core/bits';
import { hexByte } from '../../core/bytes';
import { useSetCaption } from '../../core/caption';
import { cssVar } from '../../core/palette';
import { usePlayer } from '../../core/usePlayer';
import { FlipRow, type CellLook } from './FlipRow';
import { crcFrames, hammingCaption, parityCaption, type CrcMode } from './frames';
import {
  CRC4_BITS, CRC4_GENERATOR, MAX_TEXT, MESSAGE_BITS, PARITY_DATA_BITS, PARITY_POSITIONS, POSITIONS, applyFlips, bytesOf32, checkFails,
  coverage, crc32, crc8, crcCodeword, hammingDecode, hammingEncode, hammingVerdict, isParityPosition, overallFails, parityPasses,
  roleOf, syndrome, toggleFlip, utf8, withParity, type ParityPosition,
} from './model';
import './styles.css';

const SCENES = [
  { value: 'parity' as const, label: 'Parity' },
  { value: 'hamming' as const, label: 'Hamming' },
  { value: 'crc' as const, label: 'CRC' },
];

const DATA = cssVar('info');
const NEUTRAL = cssVar('muted');
/** One categorical colour per Hamming parity group. */
const GROUP_COLOR: Record<ParityPosition, string> = { 1: cssVar('violet'), 2: cssVar('amber'), 4: cssVar('sky') };
const HONEST_FLIPS = 'You flip the bits by hand; real channels flip them at random.';
const STEP_MS = 1300;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'parity' });
  if (scene === 'hamming') return <HammingScene picker={picker} />;
  if (scene === 'crc') return <CrcScene picker={picker} />;
  return <ParityScene picker={picker} />;
}

const flipToggle = (bits: readonly Bit[], i: number) => bits.map((b, j) => (j === i ? ((1 - b) as Bit) : b));

// ── Parity ───────────────────────────────────────────────────────────────

function ParityScene({ picker }: { picker: ReactNode }) {
  const [word, setWord] = useState<Bit[]>(() => toBits(0b1011_0010, PARITY_DATA_BITS));
  const [flips, setFlips] = useState<Set<number>>(new Set());
  const setCaption = useSetCaption();
  const sent = withParity(word);
  const received = applyFlips(sent, flips);
  const passes = parityPasses(received);
  const colorOf = (i: number) => (i === PARITY_DATA_BITS ? GROUP_COLOR[1] : DATA);

  useEffect(() => {
    setCaption(parityCaption(withParity(word), flips), { quiet: true });
  }, [word, flips, setCaption]);

  return (
    <StageFrame
      height={260}
      stats={
        <Stats>
          <Stat label="Flipped in transit" value={flips.size} color={flips.size ? 'var(--bad)' : undefined} />
          <Stat label="1s received" value={received.filter((b) => b).length} sub={received.filter((b) => b).length % 2 ? 'odd' : 'even'} />
          <Stat label="Parity check" value={passes ? 'pass' : 'fail'} color={passes ? 'var(--muted)' : 'var(--bad)'} sub={passes && flips.size ? 'but data is wrong' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: DATA, label: 'data bit' },
            { color: GROUP_COLOR[1], label: 'parity bit' },
            { color: 'var(--bad)', label: 'flipped in transit / failing check' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setFlips(new Set())} disabled={!flips.size}>Clear flips</Button>
        </>,
        <Hint key="h">Edit the sender's word in the top row; flip bits "in transit" in the received row. Arrow keys move along a row.</Hint>,
      ]}
    >
      <div className="stage-pad ed">
        <WideRegion minWidth={370} label="Parity table: scroll sideways to see all of it">
          <div className="ed-table" style={{ gridTemplateColumns: `auto repeat(${sent.length}, var(--ed-cell))` }}>
            <span />
            {sent.map((_, i) => (
              <span key={i} className="ed-head">{i === PARITY_DATA_BITS ? 'P' : `d${PARITY_DATA_BITS - 1 - i}`}</span>
            ))}
            <span className="ed-label">sender</span>
            <FlipRow
              bits={word}
              look={() => ({ color: DATA })}
              onFlip={(i) => setWord(flipToggle(word, i))}
              pressed={(i) => word[i] === 1}
              ariaLabel="sender's word"
              ariaLabelOf={(i) => `sender data bit ${PARITY_DATA_BITS - 1 - i}`}
            />
            <FlipRow bits={[sent[PARITY_DATA_BITS]]} look={() => ({ color: GROUP_COLOR[1] })} ariaLabel={`parity bit ${sent[PARITY_DATA_BITS]}, computed from the word`} />
            <span className="ed-label">received</span>
            <FlipRow
              bits={received}
              look={(i) => ({ color: colorOf(i), state: flips.has(i) ? 'flipped' : undefined })}
              onFlip={(i) => setFlips(toggleFlip(flips, i))}
              ariaLabel="received bits: flip them in transit"
              ariaLabelOf={(i) => `flip ${i === PARITY_DATA_BITS ? 'the parity bit' : `data bit ${PARITY_DATA_BITS - 1 - i}`} in transit`}
            />
          </div>
        </WideRegion>
        <p className="ed-note">Even parity: P makes the total count of 1s even. One extra bit catches any odd number of flips. RAID 5 stores the same XOR parity across disks.</p>
        <Hint block>{HONEST_FLIPS}</Hint>
      </div>
    </StageFrame>
  );
}

// ── Hamming ──────────────────────────────────────────────────────────────

function HammingScene({ picker }: { picker: ReactNode }) {
  const [data, setData] = useState<Bit[]>([1, 0, 1, 1]);
  const [flips, setFlips] = useState<Set<number>>(new Set());
  const [secded, setSecded] = useState(false);
  const setCaption = useSetCaption();
  const sent = hammingEncode(data);
  const received = applyFlips(sent, flips);
  const decoded = hammingDecode(received, secded);
  const verdict = hammingVerdict(data, flips, secded);
  const s = syndrome(received);
  const slots = secded ? [0, ...POSITIONS] : [...POSITIONS];

  useEffect(() => {
    setCaption(hammingCaption(data, flips, secded), { quiet: true });
  }, [data, flips, secded, setCaption]);

  const toggleSecded = (on: boolean) => {
    setSecded(on);
    if (!on && flips.has(0)) setFlips(toggleFlip(flips, 0));
  };

  const colorOf = (slot: number) => (slot === 0 ? NEUTRAL : isParityPosition(slot) ? GROUP_COLOR[slot] : DATA);
  const decodedLook = (slot: number): CellLook => {
    const color = colorOf(slot);
    if (slot === decoded.flipped) return { color, state: flips.has(slot) ? 'corrected' : 'miscorrected' };
    return { color, state: decoded.word[slot] !== sent[slot] ? 'flipped' : undefined };
  };
  const pick = (row: readonly Bit[]) => slots.map((slot) => row[slot]);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Flipped" value={flips.size} color={flips.size ? 'var(--bad)' : undefined} />
          <Stat label="Syndrome p4 p2 p1" value={s.toString(2).padStart(3, '0')} sub={s ? `points at position ${s}` : 'all checks pass'} />
          {secded && <Stat label="Overall parity" value={overallFails(received) ? 'odd' : 'even'} color={overallFails(received) ? 'var(--bad)' : 'var(--muted)'} />}
          <Stat
            label="Result"
            value={verdict === 'uncorrectable' ? "can't fix" : verdict}
            color={verdict === 'corrected' ? 'var(--ok)' : verdict === 'miscorrected' ? 'var(--orange)' : verdict === 'clean' ? undefined : 'var(--bad)'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: DATA, label: 'data bit' },
            { color: GROUP_COLOR[1], label: 'p1 group' },
            { color: GROUP_COLOR[2], label: 'p2 group' },
            { color: GROUP_COLOR[4], label: 'p4 group' },
            ...(secded ? [{ color: NEUTRAL, label: 'overall parity (p0)' }] : []),
            { color: 'var(--bad)', label: 'flipped / failing check' },
            { color: 'var(--ok)', label: 'corrected' },
            { color: 'var(--orange)', label: 'miscorrected' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Extra overall parity bit (SECDED)" value={secded} onChange={toggleSecded} />
          <Button onClick={() => setFlips(new Set())} disabled={!flips.size}>Clear flips</Button>
        </>,
        <Hint key="h">Click data bits to change the message; click received bits to flip them. Try one flip, then two.</Hint>,
      ]}
    >
      <div className="stage-pad ed">
        <div className="ed-data">
          <span className="ed-label">data</span>
          <div className="ed-table" style={{ gridTemplateColumns: `repeat(4, var(--ed-cell))` }}>
            {data.map((_, k) => (
              <span key={k} className="ed-head">d{k + 1}</span>
            ))}
            <FlipRow
              bits={data}
              look={() => ({ color: DATA })}
              onFlip={(k) => setData(flipToggle(data, k))}
              pressed={(k) => data[k] === 1}
              ariaLabel="data bits d1 to d4"
              ariaLabelOf={(k) => `data bit d${k + 1}`}
            />
          </div>
        </div>
        <WideRegion minWidth={430} label="Hamming table: scroll sideways to see all of it">
          <div className="ed-table ed-hamming" style={{ gridTemplateColumns: `auto repeat(${slots.length}, var(--ed-cell)) auto` }}>
            <span className="ed-head ed-head-key">
              <b>role</b>
              <span>position</span>
              <span>binary</span>
            </span>
            {slots.map((slot) => (
              <span key={slot} className="ed-head">
                <b>{slot === 0 ? 'p0' : roleOf(slot)}</b>
                <span>{slot}</span>
                <span className="ed-bin">{slot === 0 ? 'all' : slot.toString(2).padStart(3, '0')}</span>
              </span>
            ))}
            <span />

            <span className="ed-label">sent</span>
            <FlipRow bits={pick(sent)} look={(k) => ({ color: colorOf(slots[k]) })} ariaLabel="sent codeword" />
            <span />

            <span className="ed-label">received</span>
            <FlipRow
              bits={pick(received)}
              look={(k) => ({ color: colorOf(slots[k]), state: flips.has(slots[k]) ? 'flipped' : undefined })}
              onFlip={(k) => setFlips(toggleFlip(flips, slots[k]))}
              ariaLabel="received codeword: flip bits in transit"
              ariaLabelOf={(k) => `flip position ${slots[k]} (${slots[k] === 0 ? 'overall parity' : roleOf(slots[k])})`}
            />
            <span />

            {PARITY_POSITIONS.map((p) => {
              const fails = checkFails(received, p);
              const covered = new Set<number>(coverage(p));
              return (
                <Band key={p} label={`p${p} covers ${coverage(p).join(',')}`} fails={fails} color={GROUP_COLOR[p]}>
                  {slots.map((slot) => (
                    <span key={slot} className={`ed-band ${covered.has(slot) ? 'is-in' : ''}`} style={{ ['--c' as string]: GROUP_COLOR[p] }}>
                      {covered.has(slot) ? received[slot] : ''}
                    </span>
                  ))}
                </Band>
              );
            })}

            <span className="ed-label">decoded</span>
            <FlipRow bits={pick(decoded.word)} look={(k) => decodedLook(slots[k])} ariaLabel="decoded codeword" />
            <span className="ed-check">{decoded.uncorrectable ? <b className="ed-bad">refused</b> : decoded.flipped === null ? '' : `fixed ${decoded.flipped}`}</span>
          </div>
        </WideRegion>
        <p className="ed-note">ECC RAM uses SECDED codes like this one (on 64-bit words) to fix single flipped bits and report double ones.</p>
        <Hint block>{HONEST_FLIPS}</Hint>
      </div>
    </StageFrame>
  );
}

function Band({ label, fails, color, children }: { label: string; fails: boolean; color: string; children: ReactNode }) {
  return (
    <>
      <span className="ed-label" style={{ color }}>{label}</span>
      {children}
      <span className={`ed-check ${fails ? 'ed-bad' : ''}`}>{fails ? 'fail' : 'pass'}</span>
    </>
  );
}

// ── CRC ──────────────────────────────────────────────────────────────────

const MODES: { value: CrcMode; label: string }[] = [
  { value: 'send', label: 'Sender: compute CRC' },
  { value: 'check', label: 'Receiver: check' },
];

function CrcScene({ picker }: { picker: ReactNode }) {
  const [message, setMessage] = useState<Bit[]>(() => toBits(0b1101_0011, MESSAGE_BITS));
  const [mode, setMode] = useState<CrcMode>('send');
  const [flips, setFlips] = useState<Set<number>>(new Set());
  const frames = useMemo(() => crcFrames(message, mode, flips), [message, mode, flips]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const codeword = crcCodeword(message);
  const width = f.work.length;
  const inWindow = (i: number) => f.step !== null && i >= f.step.at && i < f.step.at + CRC4_GENERATOR.length;
  const colorOf = (i: number) => (i < MESSAGE_BITS ? DATA : GROUP_COLOR[1]);
  const atEnd = f.step === null && f.done > 0;
  const isRemainder = (i: number) => atEnd && i >= width - CRC4_BITS;
  const remainderBad = mode === 'check' && atEnd && f.work.slice(width - CRC4_BITS).some((b) => b === 1);

  const edit = (next: () => void) => {
    next();
    player.queueNext({ play: false });
  };

  return (
    <StageFrame
      player={player}
      height={380}
      stats={
        <Stats>
          <Stat label="XOR steps" value={f.done} />
          <Stat label={mode === 'send' ? 'CRC' : 'Remainder'} value={f.work.slice(width - CRC4_BITS).join('')} sub={atEnd ? 'final' : 'so far'} color={remainderBad ? 'var(--bad)' : undefined} />
          {mode === 'check' && <Stat label="Flipped" value={flips.size} color={flips.size ? 'var(--bad)' : undefined} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: DATA, label: 'message bit' },
            { color: GROUP_COLOR[1], label: 'CRC bit' },
            { color: 'var(--hi)', label: 'generator window', shape: 'line' },
            { color: 'var(--bad)', label: 'flipped / non-zero remainder' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Side" value={mode} onChange={(m) => edit(() => setMode(m))} options={MODES} />
          {mode === 'check' && <Button onClick={() => edit(() => setFlips(new Set()))} disabled={!flips.size}>Clear flips</Button>}
        </>,
      ]}
    >
      <div className="stage-pad ed">
        <WideRegion minWidth={480} label="Message and codeword: scroll sideways to see all of it">
          <div className="ed-table" style={{ gridTemplateColumns: `auto repeat(${MESSAGE_BITS + CRC4_BITS}, var(--ed-cell-sm))` }}>
            <span className="ed-label">message</span>
            <FlipRow
              bits={message}
              look={() => ({ color: DATA })}
              onFlip={(i) => edit(() => setMessage(flipToggle(message, i)))}
              pressed={(i) => message[i] === 1}
              ariaLabel="message bits"
              ariaLabelOf={(i) => `message bit ${i + 1}`}
            />
            <span className="ed-span" style={{ gridColumn: `span ${CRC4_BITS}` }} />
            {mode === 'check' && (
              <>
                <span className="ed-label">received</span>
                <FlipRow
                  bits={applyFlips(codeword, flips)}
                  look={(i) => ({ color: colorOf(i), state: flips.has(i) ? 'flipped' : undefined })}
                  onFlip={(i) => edit(() => setFlips(toggleFlip(flips, i)))}
                  ariaLabel="received codeword: flip bits in transit"
                  ariaLabelOf={(i) => `flip ${i < MESSAGE_BITS ? `message bit ${i + 1}` : `CRC bit ${i - MESSAGE_BITS + 1}`} in transit`}
                />
              </>
            )}
          </div>
        </WideRegion>
        <WideRegion minWidth={520} label="Long division: scroll sideways to see all of it">
          <div className="ed-table ed-division" style={{ gridTemplateColumns: `auto repeat(${width}, var(--ed-cell-sm))` }}>
            <span className="ed-label">dividing</span>
            <FlipRow
              bits={f.work}
              look={(i) => ({ color: isRemainder(i) ? (remainderBad ? 'var(--bad)' : GROUP_COLOR[1]) : 'var(--muted)', state: inWindow(i) ? 'window' : undefined })}
              ariaLabel={`row being divided: ${f.work.join('')}`}
            />
            <span className="ed-label">10011</span>
            {Array.from({ length: width }, (_, i) => (
              <span key={i} className={`ed-gen ${inWindow(i) ? 'is-on' : ''}`}>{inWindow(i) && f.step ? CRC4_GENERATOR[i - f.step.at] : ''}</span>
            ))}
            <span className="ed-label">XOR</span>
            {f.step ? (
              <FlipRow bits={f.step.after} look={(i) => ({ color: inWindow(i) ? 'var(--hi)' : 'var(--dim)' })} ariaLabel={`after XOR: ${f.step.after.join('')}`} />
            ) : (
              <span className="ed-span" style={{ gridColumn: `span ${width}` }} />
            )}
          </div>
        </WideRegion>
        <Hint block>CRC-4 is a teaching size; Ethernet's frame check sequence uses CRC-32. QR codes use Reed-Solomon, a stronger cousin not shown here.</Hint>
        <RealCrcs />
      </div>
    </StageFrame>
  );
}

function RealCrcs() {
  const [text, setText] = useState('123456789');
  const bytes = utf8(text);
  const c8 = crc8(bytes);
  const c32 = crc32(bytes);
  return (
    <Box className="ed-real">
      <SectionTitle hint="the same idea at real sizes">Real CRCs</SectionTitle>
      <TextField label="Text (UTF-8)" value={text} onChange={setText} maxLength={MAX_TEXT} width={240} spellCheck={false} />
      <p className="ed-note">{bytes.length} bytes in. "123456789" is the standard test string: CRC-8 0xF4 and CRC-32 0xCBF43926.</p>
      <div className="ed-real-grid">
        <div>
          <SectionTitle weight="regular" hint="poly 0x07">CRC-8: 0x{hexByte(c8)}</SectionTitle>
          <ByteGrid bytes={[c8]} perRow={8} ariaLabel={`CRC-8 0x${hexByte(c8)}`} />
        </div>
        <div>
          <SectionTitle weight="regular" hint="IEEE, as in Ethernet">CRC-32: 0x{bytesOf32(c32).map(hexByte).join('')}</SectionTitle>
          <ByteGrid bytes={bytesOf32(c32)} perRow={8} ariaLabel={`CRC-32 0x${bytesOf32(c32).map(hexByte).join('')}`} />
        </div>
      </div>
    </Box>
  );
}
