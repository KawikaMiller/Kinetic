import { useState } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { flipBit, fromBits, type BitGroup } from '../../core/bits';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import {
  EXP_BIAS, SPECIALS, bitRole, bitsOf, decode, exactDecimal, f32Bits, f32FromBits, fields, float64Facts, power, significand, storedDigits,
  storeOutcome, type Fields,
} from './model';
import { LINES_WIDTH, MagnitudeLine, ZoomLine } from './NumberLines';
import './styles.css';

const START = 0.1;
/** Mantissa split into runs so the strip can wrap between them on a phone (only the first is labelled). */
const GROUPS: BitGroup[] = [
  { from: 0, to: 0, tone: 'bad', label: 'sign' },
  { from: 1, to: 8, tone: 'info', label: 'exponent (8 bits)' },
  { from: 9, to: 15, tone: 'violet', label: 'mantissa (23 bits)' },
  { from: 16, to: 23, tone: 'violet' },
  { from: 24, to: 31, tone: 'violet' },
];
const FACTS = float64Facts();

/** String(-0) is "0"; the lesson needs to show the sign of zero. */
const show = (v: number) => (Object.is(v, -0) ? '-0' : String(v));

function formula(f: Fields, value: number) {
  if (f.kind === 'nan') return 'exponent all 1s and mantissa ≠ 0: NaN (not a number)';
  if (f.kind === 'infinity') return `exponent all 1s and mantissa 0: ${f.sign ? '−' : '+'}Infinity`;
  if (f.kind === 'zero') return `exponent 0 and mantissa 0: ${show(value)} (zero has a sign bit too)`;
  const lead = f.kind === 'normal' ? `1.m = ${significand(f)}` : `0.m = ${significand(f)} (subnormal: no hidden 1)`;
  const pow = f.kind === 'normal' ? `2^(${f.exponent} − ${EXP_BIAS})` : `2^(1 − ${EXP_BIAS})`;
  return `(−1)^${f.sign} × ${lead} × ${pow} = ${show(value)}`;
}

export function Stage() {
  const [bits, setBits] = useState(() => f32Bits(START));
  const [typed, setTyped] = useState<number | null>(START);
  const [draft, setDraft] = useState('0.1');
  const [exact, setExact] = useState(false);
  const setCaption = useSetCaption();

  const f = fields(bits);
  const value = f32FromBits(bits);
  const finite = Number.isFinite(value);
  const shown = exact ? exactDecimal(value) : storedDigits(value);

  useIntroCaption(
    <>0.1 can't be stored exactly in binary. The float32 nearest to it is <span className="hl">{storedDigits(f32FromBits(f32Bits(START)))}</span>:
      close, but not equal. Click bits to see how the three fields build a number.</>,
  );

  const toggleBit = (i: number) => {
    const next = fromBits(flipBit(bitsOf(bits), i));
    setBits(next);
    setTyped(null);
    const nf = fields(next);
    const part = i === 0 ? 'the sign bit' : i <= 8 ? 'an exponent bit' : 'a mantissa bit';
    setCaption(
      <>Flipped {part}: now <span className="hl">{show(f32FromBits(next))}</span>
        {nf.kind === 'normal' ? <> (× 2^{power(nf)})</> : <>, a {nf.kind} value</>}.
        {i > 0 && i <= 8 && ' Exponent bits scale the number by powers of two.'}</>,
      { quiet: true },
    );
  };

  const store = () => {
    const x = Number(draft.trim());
    if (draft.trim() === '' || Number.isNaN(x)) {
      setCaption(<>That isn't a number JavaScript can read. Try 0.1, 1e10 or -3.75.</>);
      return;
    }
    const stored = f32FromBits(f32Bits(x));
    setBits(f32Bits(x));
    setTyped(x);
    const outcome = storeOutcome(x);
    setCaption(
      outcome === 'exact' ? (
        <>{draft.trim()} fits exactly: it's a sum of powers of two that float32 can hold.</>
      ) : outcome === 'overflow' ? (
        <>{draft.trim()} is bigger than the largest float32 (about 3.4 × 10³⁸), so it <span className="hl bad">overflows</span> to{' '}
          {show(stored)}. Floats don't wrap like integers: they run out at Infinity.</>
      ) : outcome === 'underflow' ? (
        <>{draft.trim()} is smaller than the smallest float32 (about 1.4 × 10⁻⁴⁵), so it <span className="hl bad">underflows</span> to{' '}
          {show(stored)}.</>
      ) : (
        <>You typed {draft.trim()}; float32 snaps it to the nearest value it can represent, <span className="hl">{storedDigits(stored)}</span>,
          off by {Math.abs(stored - x).toExponential(2)}. Not random: the nearest binary fraction.</>
      ),
    );
  };

  const pickSpecial = (id: string) => {
    const s = SPECIALS.find((x) => x.id === id)!;
    setBits(s.bits);
    setTyped(null);
    const v = f32FromBits(s.bits);
    setCaption(
      Number.isNaN(v) ? (
        <><span className="hl bad">NaN</span>: exponent all 1s, mantissa not 0. It's the only value not equal to itself: NaN === NaN is false.</>
      ) : !Number.isFinite(v) ? (
        <>Infinity: exponent all 1s, mantissa 0. Overflowing a float gives ±Infinity instead of wrapping like integers do.</>
      ) : s.id === 'nzero' ? (
        <>−0: just the sign bit. It equals +0 (−0 === 0) but 1 / −0 is −Infinity, so the sign still matters.</>
      ) : s.id === 'subnormal' ? (
        <>The smallest subnormal, 2^−149: exponent 0 drops the hidden 1 so floats can creep down towards zero.</>
      ) : s.id === 'int24' ? (
        <>2²⁴: the gap between floats here is 2, so 16,777,217 can't be stored. Integers stop being exact in float32.</>
      ) : (
        <><span className="hl">{s.label}</span> is stored as {storedDigits(v)}.</>
      ),
    );
  };

  return (
    <StageFrame
      minWidth={LINES_WIDTH + 40}
      height={420}
      stats={
        <Stats>
          <Stat label="Stored value" value={show(value)} color="var(--hi)" className="fp-stat" />
          <Stat label={exact ? 'Exactly' : 'To 20 digits'} value={shown} className="fp-stat fp-exact" />
          <Stat label="Sign" value={f.sign} color="var(--bad)" />
          <Stat label="Exponent" value={f.exponent} color="var(--info)" sub={f.kind === 'normal' ? `2^${power(f)}` : f.kind} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'sign' },
            { color: 'var(--info)', label: 'exponent' },
            { color: 'var(--violet)', label: 'mantissa' },
            { color: 'var(--hi)', label: 'current value', shape: 'dot' },
            { color: 'var(--dim)', label: 'neighbours', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          <TextField label="Type a number" value={draft} onChange={setDraft} onEnter={store} width={170} spellCheck={false} />
          <Button variant="primary" onClick={store} disabled={!draft.trim()}>Store as float32</Button>
          <Toggle label="Stored value" value={exact} onChange={setExact} off="20 digits" on="Every digit" />
        </>,
        <ControlGroup key="specials" label="Special values">
          {SPECIALS.map((s) => (
            <ChipButton key={s.id} tone="info" on={s.bits === bits} onClick={() => pickSpecial(s.id)}>
              {s.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad fp">
        <BitStrip bits={bitsOf(bits)} onToggle={toggleBit} ariaLabelOf={bitRole} groups={GROUPS} size="sm" ariaLabel="float32 bits" />
        <p className="fp-formula">{formula(f, decode(f))}</p>
        <Hint block tone="muted">
          These are float32 bits (1 + 8 + 23). JavaScript numbers are float64 (1 + 11 + 52): the same design with more bits, so the
          same rounding, just further out. The float64 panel is real JavaScript arithmetic.
        </Hint>
        <div className="fp-row">
          <div className="fp-lines">
            {finite ? (
              <>
                <ZoomLine bits={bits} value={value} typed={typed} />
                <MagnitudeLine value={value} />
              </>
            ) : (
              <Hint block>{Number.isNaN(value) ? 'NaN' : 'Infinity'} isn't on the number line, so there are no neighbours to show.</Hint>
            )}
          </div>
          <Box className="fp-f64">
            <SectionTitle hint="real JavaScript">float64 in action</SectionTitle>
            <table className="data-table fp-table">
              <tbody>
                {FACTS.map((fact) => (
                  <tr key={fact.code}>
                    <td><code>{fact.code}</code></td>
                    <td className={fact.result === 'false' ? 'fp-false' : fact.result === 'true' ? 'fp-true' : ''}>{fact.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}
