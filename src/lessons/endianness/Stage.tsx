import { AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { Flyer } from '../../components/scene';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { chunkGroups, toBits } from '../../core/bits';
import { hexByte } from '../../core/bytes';
import { useSetCaption } from '../../core/caption';
import { usePlayer } from '../../core/usePlayer';
import { misreadCaption, networkCaption, storeFrames } from './frames';
import {
  DEFAULT_VALUE, EXAMPLE_SEQ, EXAMPLE_SRC_PORT, HTTPS_PORT, PNG_SIGNATURE, PRESETS, WIDTHS, address, byteCount, byteHue, fits, hexValue,
  htons, offsetOf, parseHexValue, parsePort, probeHost, readBack, registerBytes, registerIndexAt, storeBytes, tcpHeader,
  type Preset, type Width,
} from './model';
import './styles.css';

const SCENES = [
  { value: 'store' as const, label: 'Store' },
  { value: 'misread' as const, label: 'Read it wrong' },
  { value: 'network' as const, label: 'Network order' },
];

const STEP_MS = 1000;
/** Seconds a byte takes to fly from the register to its memory cell. */
const FLY_S = 0.6;
/**
 * Byte-cell centres inside the 210px flight area, in % of its height (geometry in styles.css):
 * the register's cells sit under a 16px title + 4px gap (centre 40px); memory's are flush with the bottom (centre 190px).
 */
const REGISTER_Y = 19;
const MEMORY_Y = 90.5;
const MAX_TYPED = 40;

const ORDER = { off: 'Big-endian', on: 'Little-endian' };

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'store' });
  if (scene === 'misread') return <MisreadScene picker={picker} />;
  if (scene === 'network') return <NetworkScene picker={picker} />;
  return <StoreScene picker={picker} />;
}

/** A value typed into the hex field, its error, and how to apply it. */
function useHexField(width: Width, onValue: (v: bigint) => void) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const parsed = parseHexValue(draft, width);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onValue(parsed.value);
  };
  const field = (
    <>
      <TextField label="Value (hex)" value={draft} onChange={setDraft} onEnter={submit} placeholder={hexValue(DEFAULT_VALUE[width], width)} width={190} maxLength={MAX_TYPED} spellCheck={false} />
      <Button onClick={submit} disabled={!draft.trim()}>Set</Button>
      {error && <Hint tone="bad">{error}</Hint>}
    </>
  );
  return { field, clearError: () => setError(null) };
}

/**
 * The value after a width change: an untouched default becomes the new width's default (all
 * bytes distinct); a typed value is kept when it fits, else reset (never cut down).
 */
function resized(value: bigint, from: Width, to: Width): { value: bigint; reset: boolean } {
  if (value === DEFAULT_VALUE[from]) return { value: DEFAULT_VALUE[to], reset: false };
  return fits(value, to) ? { value, reset: false } : { value: DEFAULT_VALUE[to], reset: true };
}

const widthOptions = WIDTHS.map((w) => ({ value: w, label: `${w}-bit` }));

// ── Store ────────────────────────────────────────────────────────────────

function StoreScene({ picker }: { picker: ReactNode }) {
  const [width, setWidth] = useState<Width>(32);
  const [value, setValue] = useState(DEFAULT_VALUE[32]);
  const [little, setLittle] = useState(false);
  const [machine, setMachine] = useState(false);
  const [host] = useState(probeHost);
  const setCaption = useSetCaption();
  const frames = useMemo(() => storeFrames(value, width, little), [value, width, little]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { placed, current } = player.frame;
  const n = byteCount(width);
  const reg = registerBytes(value, width);
  const mem = storeBytes(value, width, little);
  const hex = useHexField(width, (v) => {
    setValue(v);
    setMachine(false);
  });

  const changeWidth = (w: Width) => {
    const next = resized(value, width, w);
    setWidth(w);
    setValue(next.value);
    setMachine(false);
    hex.clearError();
    if (next.reset) setCaption(<>{hexValue(value, width)} doesn't fit in {w} bits, so the register was reset to {hexValue(next.value, w)} rather than cut down.</>);
  };

  const load = (p: Preset) => {
    setWidth(p.width);
    setValue(p.value);
    if (p.little !== null) setLittle(p.little);
    setMachine(false);
    hex.clearError();
  };

  const loadMachine = () => {
    setLittle(host.little);
    setMachine(true);
  };

  const store = () => {
    player.seek(0);
    player.play();
  };

  const shown = PRESETS.find((p) => p.width === width && p.value === value && (p.little === null || p.little === little)) ?? null;
  const machineShown = machine && little === host.little;
  const flyFrom = registerIndexAt(current ?? 0, width, little);

  return (
    <StageFrame
      player={player}
      height={330}
      stats={
        <Stats>
          <Stat label="Value" value={hexValue(value, width)} sub={`${n} bytes`} />
          <Stat label="Order" value={little ? 'little' : 'big'} sub={little ? 'low byte first' : 'high byte first'} />
          <Stat label="Address" value={current === null ? '–' : address(current)} color="var(--hi)" sub={`${placed} of ${n} stored`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: byteHue(0), label: 'each byte keeps its colour' },
            { color: 'var(--hi)', label: 'address being written', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Byte order" value={little} onChange={(v) => {
            setLittle(v);
            setMachine(false);
          }} {...ORDER} />
          <Segmented label="Width" value={width} onChange={changeWidth} options={widthOptions} />
          <Button variant="primary" onClick={store}>Store at {address(0)}</Button>
        </>,
        hex.field,
        <ControlGroup key="presets" label="Where you meet byte order">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} on={shown?.id === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
          ))}
          <ChipButton on={machineShown} onClick={loadMachine}>Your machine</ChipButton>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad en">
        <div className="en-flight">
          <ByteRow className="en-at-top" title="Register" bytes={reg} hueOf={(k) => byteHue(k)} ariaLabel={`register ${hexValue(value, width)}`} />
          <ByteRow
            className="en-at-bottom"
            title="Memory"
            bytes={mem}
            hueOf={(j) => byteHue(registerIndexAt(j, width, little))}
            labels={mem.map((_, j) => address(j))}
            filled={(j) => j < placed}
            current={current}
            ariaLabel={`memory from ${address(0)}: ${mem.slice(0, placed).map(hexByte).join(' ') || 'empty'}`}
          />
          <AnimatePresence>
            {current !== null && (
              <Flyer
                key={`${player.index}-${little}`}
                className="en-flyer"
                style={{ ['--c' as string]: byteHue(flyFrom) } as CSSProperties}
                from={{ x: cellX(flyFrom, n), y: REGISTER_Y }}
                to={{ x: cellX(current, n), y: MEMORY_Y }}
                duration={FLY_S}
                fade={[0, 1, 1, 0]}
              >
                {hexByte(reg[flyFrom])}
              </Flyer>
            )}
          </AnimatePresence>
        </div>
        <div className="en-bits">
          <SectionTitle weight="regular" hint="bits inside each byte never move">Register bits</SectionTitle>
          <BitStrip
            bits={toBits(Number(value & 0xffffffffn), Math.min(width, 32))}
            groups={chunkGroups(Math.min(width, 32), 8, { label: (k) => hexByte(reg[k + n - Math.min(n, 4)]) })}
            toneOf={(_, bit) => (bit ? 'hi' : 'dim')}
            size="sm"
            ariaLabel="register bits"
          />
          {width === 64 && <Hint>Showing the low 32 bits; the top 32 work the same way.</Hint>}
        </div>
        {shown?.id === 'png' && (
          <p className="en-note">
            A PNG file opens with the signature {PNG_SIGNATURE.map(hexByte).join(' ')}. The next 4 bytes give the first chunk's length, 13,
            stored big-endian as {storeBytes(value, 32, false).map(hexByte).join(' ')}: PNG is big-endian throughout.
          </p>
        )}
        {shown?.id === 'bom' && (
          <p className="en-note">
            UTF-16 files start with U+FEFF. Big-endian files begin {storeBytes(value, 16, false).map(hexByte).join(' ')}, little-endian ones{' '}
            {storeBytes(value, 16, true).map(hexByte).join(' ')}, so a reader can tell the order from the first two bytes.
          </p>
        )}
        {machineShown && (
          <p className="en-note">
            Probed live: <code>new Uint8Array(new Uint32Array([1]).buffer)[0]</code> is <b>{host.firstByte}</b> here, so this machine is{' '}
            <b>{host.little ? 'little' : 'big'}-endian</b>. For reference, not from the probe: most x86 and ARM systems run little-endian.
          </p>
        )}
      </div>
    </StageFrame>
  );
}

/** Centre of cell k of n equal columns, in % of the row's width. */
const cellX = (k: number, n: number) => ((k + 0.5) / n) * 100;

function ByteRow({
  title, bytes, hueOf, labels, filled = () => true, current = null, bad = false, className = '', ariaLabel,
}: {
  title: string;
  bytes: readonly number[];
  hueOf: (i: number) => string;
  labels?: readonly string[];
  filled?: (i: number) => boolean;
  current?: number | null;
  bad?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div className={`en-row-wrap ${className}`}>
      <span className={`en-row-title ${bad ? 'is-bad' : ''}`}>{title}</span>
      <div className={`en-row ${bad ? 'is-bad' : ''}`} style={{ gridTemplateColumns: `repeat(${bytes.length}, 1fr)` }} role="img" aria-label={ariaLabel}>
        {bytes.map((b, i) => (
          <div key={i} className="en-slot">
            {labels && <span className={`en-addr ${i === current ? 'is-current' : ''}`}>{labels[i]}</span>}
            <span
              className={`en-byte ${filled(i) ? '' : 'is-empty'} ${i === current ? 'is-current' : ''}`}
              style={{ ['--c' as string]: hueOf(i) } as CSSProperties}
            >
              {filled(i) ? hexByte(b) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Read it wrong ────────────────────────────────────────────────────────

function MisreadScene({ picker }: { picker: ReactNode }) {
  const [width, setWidth] = useState<Width>(32);
  const [value, setValue] = useState(DEFAULT_VALUE[32]);
  const [writeLittle, setWriteLittle] = useState(true);
  const [readLittle, setReadLittle] = useState(false);
  const setCaption = useSetCaption();
  const hex = useHexField(width, setValue);
  const mem = storeBytes(value, width, writeLittle);
  const got = readBack(value, width, writeLittle, readLittle);
  const wrong = got !== value;
  // Which original byte each byte of the read-back register came from, so its colour follows it.
  const sourceOf = (k: number) => registerIndexAt(offsetOf(k, width, readLittle), width, writeLittle);

  useEffect(() => {
    setCaption(misreadCaption(value, width, writeLittle, readLittle), { quiet: true });
  }, [value, width, writeLittle, readLittle, setCaption]);

  const changeWidth = (w: Width) => {
    setWidth(w);
    setValue(resized(value, width, w).value);
    hex.clearError();
  };

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Written" value={hexValue(value, width)} sub={writeLittle ? 'little-endian' : 'big-endian'} />
          <Stat label="Read back" value={hexValue(got, width)} sub={readLittle ? 'as little-endian' : 'as big-endian'} color={wrong ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: byteHue(0), label: 'each byte keeps its colour' },
            { color: 'var(--bad)', label: 'value read wrong' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Writer stores" value={writeLittle} onChange={setWriteLittle} {...ORDER} />
          <Toggle label="Reader assumes" value={readLittle} onChange={setReadLittle} {...ORDER} />
          <Segmented label="Width" value={width} onChange={changeWidth} options={widthOptions} />
        </>,
        hex.field,
      ]}
    >
      <div className="stage-pad en">
        <div className="en-stack">
          <ByteRow title="Writer's register" bytes={registerBytes(value, width)} hueOf={(k) => byteHue(k)} ariaLabel={`written ${hexValue(value, width)}`} />
          <ByteRow title="Memory" bytes={mem} hueOf={(j) => byteHue(registerIndexAt(j, width, writeLittle))} labels={mem.map((_, j) => address(j))} ariaLabel={`memory ${mem.map(hexByte).join(' ')}`} />
          <ByteRow title="Reader's register" bytes={registerBytes(got, width)} hueOf={(k) => byteHue(sourceOf(k))} bad={wrong} ariaLabel={`read back ${hexValue(got, width)}`} />
        </div>
        <Hint block>The classic bug when parsing a binary file or a network header: the bytes are fine, the assumed order isn't.</Hint>
      </div>
    </StageFrame>
  );
}

// ── Network byte order ───────────────────────────────────────────────────

/** Port bytes take hues past the first two, so they never match the header's blue and violet field tints. */
const PORT_HUE_OFFSET = 2;
const portHue = (k: number) => byteHue(k + PORT_HUE_OFFSET);

function NetworkScene({ picker }: { picker: ReactNode }) {
  const [host] = useState(probeHost);
  const [hostLittle, setHostLittle] = useState(host.little);
  const [port, setPort] = useState(HTTPS_PORT);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setCaption = useSetCaption();
  const portBytes = registerBytes(BigInt(port), 16);
  const hostMem = storeBytes(BigInt(port), 16, hostLittle);
  const header = tcpHeader(EXAMPLE_SRC_PORT, port, EXAMPLE_SEQ);

  useEffect(() => {
    setCaption(networkCaption(port, hostLittle), { quiet: true });
  }, [port, hostLittle, setCaption]);

  const submit = () => {
    const parsed = parsePort(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPort(parsed.value);
  };

  return (
    <StageFrame
      height={320}
      stats={
        <Stats>
          <Stat label="Port" value={port} sub={hexValue(BigInt(port), 16)} />
          <Stat label="htons(port)" value={htons(port, hostLittle)} sub={hostLittle ? 'bytes swapped' : 'unchanged'} />
          <Stat label="This machine" value={host.little ? 'little' : 'big'} sub="probed live" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: portHue(0), label: 'port bytes (one colour each)' },
            { color: 'var(--hi)', label: 'destination port in the header', shape: 'line' },
            { color: 'var(--info)', label: 'source port field' },
            { color: 'var(--violet)', label: 'destination port field' },
            { color: 'var(--orange)', label: 'sequence number field' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Host byte order" value={hostLittle} onChange={setHostLittle} {...ORDER} />
        </>,
        <>
          <TextField label="Port (decimal)" value={draft} onChange={setDraft} onEnter={submit} placeholder="443" width={120} maxLength={MAX_TYPED} spellCheck={false} />
          <Button onClick={submit} disabled={!draft.trim()}>Set port</Button>
          {error && <Hint tone="bad">{error}</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad en">
        <div className="en-stack en-narrow">
          <ByteRow title={`Host memory (${hostLittle ? 'little' : 'big'}-endian)`} bytes={hostMem} hueOf={(j) => portHue(registerIndexAt(j, 16, hostLittle))} labels={hostMem.map((_, j) => address(j))} ariaLabel={`host memory ${hostMem.map(hexByte).join(' ')}`} />
          <ByteRow title="On the wire (big-endian)" bytes={portBytes} hueOf={portHue} ariaLabel={`network order ${portBytes.map(hexByte).join(' ')}`} />
        </div>
        <div className="en-header">
          <SectionTitle hint="first 8 bytes">TCP header</SectionTitle>
          <ByteGrid
            bytes={header}
            perRow={8}
            size="md"
            fields={[
              { from: 0, to: 1, tone: 'info', label: `source port ${EXAMPLE_SRC_PORT} (example)` },
              { from: 2, to: 3, tone: 'violet', label: `destination port ${port}` },
              { from: 4, to: 7, tone: 'orange', label: 'sequence number (example)' },
            ]}
            highlight={[{ i: 2, tone: 'hi' }, { i: 3, tone: 'hi' }]}
            ariaLabel="TCP header bytes"
          />
        </div>
        <CodePanel
          title="Putting the port in the header"
          lines={[`hdr->dst_port = htons(${port}); // C`, `view.setUint16(2, ${port}); // JS, big-endian by default`]}
        />
        <Hint block>
          The host toggle starts at what this machine probed ({host.little ? 'little' : 'big'}-endian); flip it to see the other kind of host.
        </Hint>
      </div>
    </StageFrame>
  );
}
