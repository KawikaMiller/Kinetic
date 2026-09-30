import { useState } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { chunkGroups, flipBit, fromBits, placeValue, toBits, type Bit } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import {
  BASE_NAMES, PRESETS, WIDTHS, countUpSteps, formatIn, hexDigit, maxValue, parseAnyBase, rgbBytes, rwxString,
  type Base, type Preset, type RippleStep, type Width,
} from './model';
import './styles.css';

const RIPPLE_MS = 380;
const INPUT_EXAMPLES = '255, 0xFF, 0b1010, #FF8800'; // allow-color: example inputs, not a colour
const START_VALUE = 0x2a;

interface Ripple {
  steps: RippleStep[];
  at: number;
  wrapped: boolean;
}

export function Stage() {
  const [width, setWidth] = useState<Width>(16);
  const [bits, setBits] = useState<Bit[]>(() => toBits(START_VALUE, 16));
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [draft, setDraft] = useState('');
  const [readAs, setReadAs] = useState<Base>(10);
  const [inputError, setInputError] = useState<string | null>(null);
  const setCaption = useSetCaption();

  const value = fromBits(bits);
  const ring = ripple ? ripple.steps[ripple.at]?.ring : undefined;

  useIntroCaption(
    <>A {width}-bit register. Click any bit to flip it: every bit is worth double the one to its right, and the
      same value appears in four bases above.</>,
  );

  const load = (next: number, w: Width, from: Preset | null = null) => {
    setRipple(null);
    setWidth(w);
    setBits(toBits(next, w));
    setPreset(from);
  };

  const toggle = (i: number) => {
    const next = flipBit(bits, i);
    const v = fromBits(next);
    load(v, width);
    setCaption(
      <>Bit worth <b>{placeValue(i, width)}</b> is now {next[i]}: that makes <span className="hl">{v}</span>, which is{' '}
        <span className="hl violet">{formatIn(v, 16, width)}</span> in hex. Same number, different spelling.</>,
      { quiet: true },
    );
  };

  const countUp = () => {
    const steps = countUpSteps(bits);
    const wrapped = steps.length > 0 && steps.every((s) => s.bits[s.ring] === 0);
    setPreset(null);
    setRipple({ steps, at: 0, wrapped });
    setBits(steps[0].bits);
    setCaption(
      steps.length === 1 ? (
        <>+1: the rightmost bit was 0, so it just becomes 1. No carry.</>
      ) : (
        <>+1: each trailing 1 overflows to 0 and <span className="hl info">carries</span> left, like 0999 + 1 in
          decimal, until it lands on a 0.</>
      ),
    );
  };

  useInterval(
    () => {
      if (!ripple) return;
      const at = ripple.at + 1;
      if (at >= ripple.steps.length) {
        setRipple(null);
        if (ripple.wrapped) {
          setCaption(<>Every bit was 1, so the carry fell off the left end: the register <span className="hl bad">wrapped to 0</span>. That's overflow.</>);
        }
        return;
      }
      setBits(ripple.steps[at].bits);
      setRipple({ ...ripple, at });
    },
    RIPPLE_MS,
    ripple !== null,
  );

  const changeWidth = (w: Width) => {
    const kept = value % 2 ** w;
    load(kept, w);
    setCaption(
      kept === value ? (
        <>Now {w} bits wide: room for 0 to {maxValue(w).toLocaleString()}.</>
      ) : (
        <>Only the low {w} bits fit, so {value} became <span className="hl bad">{kept}</span>: the top bits were cut off.</>
      ),
    );
  };

  const submit = () => {
    const parsed = parseAnyBase(draft, readAs, width);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    load(parsed.value, width);
    setCaption(
      <>Read <span className="hl">{draft.trim()}</span> as {BASE_NAMES[parsed.base]}: that's {parsed.value} in decimal, and these are
        its bits.</>,
    );
  };

  const choosePreset = (p: Preset) => {
    load(p.value, p.width, p);
    setCaption(<><span className="hl violet">{p.label}</span>: {p.note}</>);
  };

  const groups = chunkGroups(width, 4, { tone: 'violet', label: (_, from, to) => hexDigit(bits.slice(from, to + 1)) });
  const shownPreset = preset && preset.value === value && preset.width === width ? preset : null;

  return (
    <StageFrame
      height={260}
      stats={
        <Stats>
          <Stat label="Decimal" value={<AnimatedValue value={value.toLocaleString()} />} />
          <Stat label="Hex" value={<AnimatedValue value={formatIn(value, 16, width)} />} color="var(--violet)" />
          <Stat label="Octal" value={<AnimatedValue value={formatIn(value, 8, width)} />} />
          <Stat label="Binary" value={formatIn(value, 2, width)} className="bh-bin" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit = 1' },
            { color: 'var(--dim)', label: 'bit = 0' },
            { color: 'var(--info)', label: 'carry', shape: 'line' },
            { color: 'var(--violet)', label: 'nibble → hex digit', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Register" value={width} onChange={changeWidth} options={WIDTHS.map((w) => ({ value: w, label: `${w}-bit` }))} />
          <Button variant="primary" onClick={countUp} disabled={ripple !== null}>+1 (count up)</Button>
          <Button onClick={() => load(0, width)}>Clear</Button>
          <Button onClick={() => load(maxValue(width), width)}>All ones</Button>
        </>,
        <>
          <TextField label="Type a number" value={draft} onChange={setDraft} onEnter={submit} placeholder={INPUT_EXAMPLES} width={200} spellCheck={false} />
          <Segmented label="No prefix? Read as" value={readAs} onChange={setReadAs} options={([10, 16, 8, 2] as Base[]).map((b) => ({ value: b, label: BASE_NAMES[b] }))} />
          <Button onClick={submit} disabled={!draft.trim()}>Show bits</Button>
          {inputError && <Hint className="bh-error">{inputError}</Hint>}
        </>,
        <ControlGroup key="presets" label="Where you meet other bases">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} on={preset?.id === p.id} onClick={() => choosePreset(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad bh">
        <BitStrip
          bits={bits}
          onToggle={ripple ? undefined : toggle}
          groups={groups}
          placeValues={width === 24 ? 'exponent' : true}
          toneOf={(_, bit) => (bit ? 'hi' : 'dim')}
          highlight={ring === undefined ? [] : [ring]}
          size={width === 8 ? 'lg' : 'md'}
          ariaLabel={`${width}-bit register`}
        />
        <p className="bh-sum">
          {bits.some((b) => b) ? (
            <>
              {bits
                .map((b, i) => (b ? placeValue(i, width).toLocaleString() : null))
                .filter(Boolean)
                .join(' + ')}{' '}
              = <b>{value.toLocaleString()}</b>
            </>
          ) : (
            <>all bits 0 = <b>0</b></>
          )}
        </p>
        {width === 24 && <ColourBytes value={value} />}
        {shownPreset?.id === 'chmod' && <Permissions value={value} />}
      </div>
    </StageFrame>
  );
}

/** The 24-bit register read as #RRGGBB: three bytes and the colour they make. */
function ColourBytes({ value }: { value: number }) {
  const [r, g, b] = rgbBytes(value);
  return (
    <Box className="bh-colour">
      <span className="bh-swatch" style={{ background: `rgb(${r} ${g} ${b})` }} aria-hidden="true" />
      <div>
        <SectionTitle>As a CSS colour</SectionTitle>
        <p className="bh-colour-bytes">
          <code>#{formatIn(value, 16, 24).slice(2)}</code> = red <b>{r}</b>, green <b>{g}</b>, blue <b>{b}</b>: one byte (two hex
          digits) each. Flip bits to change the colour.
        </p>
      </div>
    </Box>
  );
}

/** The low 9 bits read as Unix permissions: one octal digit per rwx triple. */
function Permissions({ value }: { value: number }) {
  const low9 = toBits(value, 9);
  const who = ['owner', 'group', 'others'];
  return (
    <Box className="bh-perms">
      <SectionTitle hint={<code>{rwxString(value)}</code>}>As chmod permissions</SectionTitle>
      <BitStrip
        bits={low9}
        size="sm"
        labelOf={(i) => 'rwx'[i % 3]}
        toneOf={(_, bit) => (bit ? 'hi' : 'dim')}
        groups={chunkGroups(9, 3, { tone: 'violet', label: (k, from, to) => `${who[k]} ${fromBits(low9.slice(from, to + 1))}` })}
        ariaLabel="permission bits"
      />
    </Box>
  );
}
