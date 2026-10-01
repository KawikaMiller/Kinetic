import { useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { chunkGroups, toBits } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import {
  ADD_PRESETS, BYTE, COUNTER32_START, INT32_MAX, addBytes, crossings, crossings32, negateSteps, unixDate, unsigned32, unsigned8,
  wheelIndex, wrap32, wrap8, type NegateSteps,
} from './model';
import { AddPanel, NegatePanel } from './Panels';
import { Wheel, type Flash } from './Wheel';
import './styles.css';

type Mode = 'wheel' | 'add';

const START_TURNS = 124;
const NEGATE_STEP_MS = 1100;
const NEGATE_ROWS = 2;
const hex8 = (v: number) => `0x${unsigned8(v).toString(16).toUpperCase().padStart(2, '0')}`;
const hex32 = (v: number) => `0x${unsigned32(v).toString(16).toUpperCase().padStart(8, '0')}`;

/** Shortest turn from byte `from` to byte `to` on the 256-step wheel. */
const shortestDelta = (from: number, to: number) => ((((to - from) % BYTE) + BYTE + BYTE / 2) % BYTE) - BYTE / 2;

/** What adding x + y in 8 bits means for each reading. */
function pairCaption(x: number, y: number): ReactNode {
  const s = addBytes(x, y);
  if (s.signedOverflow) {
    return (
      <>{x} + {y} = {s.trueSigned}, but 8 signed bits say <span className="hl bad">{s.resultSigned}</span>: both inputs have the same
        sign and the result's sign flipped. That's the overflow flag.</>
    );
  }
  if (s.unsignedWraps) {
    return (
      <>A carry fell off the top, so unsigned is wrong ({s.resultUnsigned}), but signed {x} + {y} ={' '}
        <span className="hl ok">{s.resultSigned}</span> is right. Same bits, different verdicts.</>
    );
  }
  return <>{x} + {y} = <span className="hl ok">{s.resultSigned}</span>: no carry out and no sign flip, so both readings are right.</>;
}

export function Stage() {
  const [mode, setMode] = useState<Mode>('wheel');
  const [turns, setTurns] = useState(START_TURNS);
  const [wide, setWide] = useState(false);
  const [counter, setCounter] = useState(COUNTER32_START);
  const [wrapped32, setWrapped32] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [negate, setNegate] = useState<{ steps: NegateSteps; shown: number } | null>(null);
  const [a, setA] = useState(100);
  const [b, setB] = useState(50);
  const setCaption = useSetCaption();

  const byte = wheelIndex(turns);

  useIntroCaption(
    <>The same 8 bits, read two ways: the outer ring as unsigned (0…255), the inner ring as signed (−128…127). Press
      +1 to turn the wheel past 127.</>,
  );

  const flashSeams = (signed: boolean, unsigned: boolean) => {
    if (signed || unsigned) setFlash((f) => ({ signed, unsigned, id: (f?.id ?? 0) + 1 }));
  };

  const move = (delta: number) => {
    setNegate(null);
    if (wide) {
      const c = crossings32(counter, delta);
      const next = wrap32(counter + delta);
      setCounter(next);
      setTurns((t) => t + delta);
      setWrapped32(c.signed);
      setCaption(
        c.signed ? (
          <>{wrap32(counter).toLocaleString()} {delta > 0 ? '+' : '−'} {Math.abs(delta)} ={' '}
            <span className="hl bad">{next.toLocaleString()}</span>. The signed 32-bit counter wrapped: that's the view counter
            that Gangnam Style was heading for, and the clock that runs out in 2038.</>
        ) : (
          <>Signed 32-bit counter: {next.toLocaleString()}. It wraps after {INT32_MAX.toLocaleString()}.</>
        ),
        { quiet: !c.signed },
      );
      return;
    }
    const c = crossings(byte, delta);
    const next = unsigned8(byte + delta);
    setTurns((t) => t + delta);
    flashSeams(c.signed, c.unsigned);
    setCaption(
      c.signed ? (
        <>{wrap8(byte)} {delta > 0 ? '+' : '−'} {Math.abs(delta)} = <span className="hl bad">{wrap8(next)}</span> signed. The bits just
          rolled past 0111 1111, the sign bit flipped, and the answer is wildly wrong. No error, no warning: <b>signed overflow</b>.</>
      ) : c.unsigned ? (
        <>{byte} {delta > 0 ? '+' : '−'} {Math.abs(delta)} = <span className="hl bad">{next}</span> unsigned: the carry fell off the top
          bit and the counter <b>wrapped around</b>. Signed, it's just {wrap8(byte)} → {wrap8(next)}, which is fine.</>
      ) : (
        <>{byte} unsigned, {wrap8(byte)} signed: the same bits, <code>{toBits(next, 8).join('')}</code>.</>
      ),
      { quiet: !(c.signed || c.unsigned) },
    );
  };

  const startNegate = () => {
    const steps = negateSteps(byte);
    setNegate({ steps, shown: 0 });
    setCaption(<>Negating {wrap8(byte)}: first, <b>invert every bit</b>.</>);
  };

  useInterval(
    () => {
      if (!negate) return;
      const shown = negate.shown + 1;
      setNegate({ ...negate, shown });
      if (shown === 1) {
        setCaption(<>Inverted: that's {wrap8(~byte)}, one less than the answer. Now <b>add 1</b>.</>);
        return;
      }
      const target = unsigned8(negate.steps.resultValue);
      setTurns((t) => t + shortestDelta(byte, target));
      setCaption(
        negate.steps.resultValue === wrap8(byte) && byte !== 0 ? (
          <>−(−128) came back as <span className="hl bad">−128</span>. +128 doesn't fit in 8 signed bits, so −128 has no positive
            twin. (In C, <code>abs(INT_MIN)</code> has the same problem.)</>
        ) : (
          <>Invert, then add 1: −({wrap8(byte)}) = <span className="hl">{negate.steps.resultValue}</span>. That's all two's complement
            negation is, and why the same adder circuit handles subtraction.</>
        ),
      );
    },
    NEGATE_STEP_MS,
    negate !== null && negate.shown < NEGATE_ROWS,
  );

  const toggleWide = (on: boolean) => {
    setWide(on);
    setNegate(null);
    if (on) {
      setCounter(COUNTER32_START);
      setWrapped32(false);
      setTurns((t) => t + shortestDelta(byte, unsigned8(COUNTER32_START)));
      setCaption(
        <>32-bit readouts: a counter at {COUNTER32_START.toLocaleString()}, three clicks from the top. The wheel keeps showing its
          lowest byte.</>,
      );
    }
  };

  const sum = addBytes(a, b);
  const setPair = (x: number, y: number) => {
    setA(x);
    setB(y);
    setCaption(pairCaption(x, y), { quiet: true });
  };

  // Each mode gets its own caption, so the wheel's "press +1" never lingers over the adder.
  const switchMode = (m: Mode) => {
    setMode(m);
    setNegate(null);
    setCaption(
      m === 'add' ? (
        <>Two bytes added column by column, carries in blue. {pairCaption(a, b)}</>
      ) : (
        <>Back to the wheel: {byte} unsigned, {wrap8(byte)} signed. Press +1 to turn it past 127.</>
      ),
    );
  };

  const modeSwitch = (
    <Segmented label="Mode" value={mode} onChange={switchMode} options={[{ value: 'wheel', label: 'Turn the wheel' }, { value: 'add', label: 'Add two numbers' }]} />
  );

  if (mode === 'add') {
    return (
      <StageFrame
        height={360}
        stats={
          <Stats>
            <Stat label="A + B (signed)" value={<AnimatedValue value={sum.resultSigned} />} color="var(--info)" sub={`should be ${sum.trueSigned}`} />
            <Stat label="A + B (unsigned)" value={<AnimatedValue value={sum.resultUnsigned} />} color="var(--violet)" sub={`should be ${sum.trueUnsigned}`} />
            <Stat label="Carry out" value={sum.carryOut} color={sum.carryOut ? 'var(--bad)' : undefined} />
          </Stats>
        }
        legend={
          <Legend items={[{ color: 'var(--hi)', label: 'bit = 1' }, { color: 'var(--info)', label: 'carry' }, { color: 'var(--bad)', label: 'wrong result / carry lost' }]} />
        }
        controls={[
          <>
            {modeSwitch}
            <Slider label="A" value={a} min={-128} max={127} onChange={(v) => setPair(v, b)} />
            <Slider label="B" value={b} min={-128} max={127} onChange={(v) => setPair(a, v)} />
          </>,
          <ControlGroup key="presets" label="Try">
            {ADD_PRESETS.map((p) => (
              <Button key={p.label} onClick={() => setPair(p.a, p.b)}>{p.label}</Button>
            ))}
          </ControlGroup>,
        ]}
      >
        <div className="stage-pad">
          <AddPanel sum={sum} />
        </div>
      </StageFrame>
    );
  }

  const bits32 = toBits(counter, 32);
  return (
    <StageFrame
      height={380}
      stats={
        wide ? (
          <Stats>
            <Stat label="Signed int32" value={<AnimatedValue value={counter.toLocaleString()} />} color={wrapped32 ? 'var(--bad)' : 'var(--info)'} sub={wrapped32 ? 'just overflowed' : undefined} />
            <Stat label="Unsigned uint32" value={unsigned32(counter).toLocaleString()} color="var(--violet)" />
            <Stat label="Hex" value={hex32(counter)} />
            <Stat label="As Unix time (s)" value={unixDate(counter)} className="tc-date" />
          </Stats>
        ) : (
          <Stats>
            <Stat label="Unsigned" value={<AnimatedValue value={byte} />} color="var(--violet)" />
            <Stat label="Signed" value={<AnimatedValue value={wrap8(byte)} />} color="var(--info)" />
            <Stat label="Hex" value={hex8(byte)} />
          </Stats>
        )
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current position' },
            { color: 'var(--violet)', label: 'unsigned ring' },
            { color: 'var(--info)', label: 'signed ring' },
            { color: 'var(--bad)', label: 'overflow flash', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {modeSwitch}
          <Button onClick={() => move(-16)}>−16</Button>
          <Button onClick={() => move(-1)}>−1</Button>
          <Button variant="primary" onClick={() => move(1)}>+1</Button>
          <Button onClick={() => move(16)}>+16</Button>
          <Button onClick={startNegate} disabled={wide || (negate !== null && negate.shown < NEGATE_ROWS)}>Negate</Button>
        </>,
        <>
          <Toggle label="Width" value={wide} onChange={toggleWide} off="8-bit" on="32-bit (readouts only)" />
          {wide && <Button onClick={() => toggleWide(true)}>Back to {COUNTER32_START.toLocaleString()}</Button>}
        </>,
      ]}
    >
      <div className="stage-pad tc">
        <Wheel turns={turns} flash={flash} />
        <div className="tc-side">
          {wide ? (
            <>
              <BitStrip bits={bits32} size="sm" groups={chunkGroups(32, 8, { tone: 'violet' })} ariaLabel="32-bit counter" />
              <Hint block tone="muted">
                32-bit mode only changes the readouts: the wheel still shows the counter's lowest byte, so it doesn't flash for the
                32-bit overflow. The int32 readout turns red instead.
              </Hint>
            </>
          ) : (
            <BitStrip bits={toBits(byte, 8)} placeValues groups={[{ from: 0, to: 0, tone: 'info', label: 'sign' }]} ariaLabel="8 bits" />
          )}
          {negate && <NegatePanel steps={negate.steps} shown={negate.shown} />}
          <Box className="tc-langs">
            <SectionTitle>Does overflow throw an error?</SectionTitle>
            <ul>
              <li>Usually <b>no</b>, it silently wraps: Java, C#, Go, and unsigned integers in C/C++.</li>
              <li>Signed overflow in C/C++ is undefined behaviour; Swift traps; Rust panics in debug builds and wraps in release.</li>
              <li>JavaScript numbers are 64-bit floats, so <code>127 + 1</code> is just 128, but <code>Int8Array</code> and <code>x | 0</code> wrap like this.</li>
            </ul>
          </Box>
          {wide && (
            <Box className="tc-langs">
              <SectionTitle>Where 32 bits ran out</SectionTitle>
              <ul>
                <li>In 2014 Gangnam Style neared {INT32_MAX.toLocaleString()} views, and YouTube moved its view counter to 64 bits.</li>
                <li>Unix time as a signed 32-bit number of seconds ends at {unixDate(INT32_MAX)}; one second later it reads {unixDate(wrap32(INT32_MAX + 1))}.</li>
              </ul>
            </Box>
          )}
        </div>
      </div>
    </StageFrame>
  );
}
