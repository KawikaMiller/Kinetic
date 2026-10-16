import { useMemo, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { chunkGroups, toBits } from '../../core/bits';
import { overflowCaption, stepText } from './captions';
import { OPENING, STEPS } from './opening';
import { asWritten, assumingNoOverflow, boundaryValues, differingInputs, differs, isDefined, rangeOf, retarget, WIDTHS, wrap, type IntType } from './ub';

const STRIP_SIDE = { 8: 16, 16: 256 } as const;
const STRIP_CELL = { 8: 14, 16: 3 } as const;
const num = (v: number) => v.toLocaleString('en-US');

const typeName = (t: IntType) => `${t.signed ? 'signed' : 'unsigned'} ${t.width}-bit`;

/** Scene 1: a check that the optimiser may remove, drawn over the whole input space. */
export function OverflowScene({ picker }: { picker: ReactNode }) {
  const [type, setType] = useState<IntType>(OPENING.overflow.type);
  const [x, setX] = useState(OPENING.overflow.x);
  const [step, setStep] = useState(OPENING.overflow.step);
  const [note, setNote] = useState<string | null>(OPENING.overflow.note);
  const { min, max } = rangeOf(type);
  const strip = type.width === 8 || type.width === 16 ? type.width : null;
  const bad = useMemo(() => (strip ? differingInputs(type) : []), [type, strip]);
  /** The strip's cell tones depend only on the type, so they are not recomputed when x moves. */
  const cells = useMemo(
    () =>
      strip
        ? Array.from({ length: 2 ** strip }, (_, i) => {
            const isBad = differs(rangeOf(type).min + i, type);
            return { tone: isBad ? ('bad' as const) : ('ok' as const), fill: isBad ? ('solid' as const) : ('tint' as const) };
          })
        : [],
    [type, strip],
  );

  const change = (next: IntType) => {
    const r = retarget(x, type, next);
    setType(next);
    setX(r.x);
    setNote(r.note);
  };
  const setValue = (v: number) => {
    setX(v);
    setNote(null);
  };
  const cellOf = (v: number) => {
    const side = STRIP_SIDE[type.width as 8 | 16];
    const i = v - min;
    return { r: Math.floor(i / side), c: i % side };
  };
  const sumBits = toBits(x + 1, type.width);
  const signBit = (i: number) => (i === 0 && type.signed ? ('orange' as const) : undefined);
  const returnLine = `${type.signed ? 'int' : 'unsigned'} overflows(${type.signed ? 'int' : 'unsigned'} x) { return x + 1 < x; }`;

  return (
    <StageFrame
      height={620}
      intro={overflowCaption(type, x, note)}
      introKey={`${type.width}-${type.signed}-${x}-${note}`}
      stats={
        <Stats>
          <Stat label="As written (wraps)" value={asWritten(x, type)} color="var(--info)" sub={`x + 1 is ${num(wrap(x + 1, type))} in ${typeName(type)}`} />
          <Stat label={type.signed ? 'Assuming no overflow' : 'Rewrite not applied'} value={assumingNoOverflow(x, type)} color="var(--violet)" sub={type.signed ? 'the rule x + c < x is false' : 'unsigned wrap is defined'} />
          <Stat label="This input" value={differs(x, type) ? 'columns differ' : 'columns agree'} color={differs(x, type) ? 'var(--bad)' : 'var(--ok)'} sub={isDefined(x, type) ? 'inside the contract' : 'outside the contract: undefined'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...(type.signed ? [{ color: 'var(--orange)', label: 'the sign bit', shape: 'square' as const }] : []),
            { color: 'var(--info)', label: 'as written', shape: 'square' },
            { color: 'var(--violet)', label: 'after the rewrite', shape: 'square' },
            { color: 'var(--bad)', label: 'the columns disagree', shape: 'square' },
            { color: 'var(--ok)', label: 'the columns agree', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Width (bits)" value={type.width} onChange={(w) => change({ ...type, width: w })} options={WIDTHS.map((w) => ({ value: w, label: String(w) }))} />
          <Toggle label="Type" value={type.signed} onChange={(s) => change({ ...type, signed: s })} off="unsigned" on="signed" />
        </>,
        <>
          <Slider label="x" value={x} min={min} max={max} onChange={setValue} format={num} />
          {boundaryValues(type).map((v, i) => (
            <ChipButton key={i} tone="info" on={x === v} onClick={() => setValue(v)}>{v === min ? 'MIN' : v === max ? 'MAX' : v === max - 1 ? 'MAX-1' : String(v)}</ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="ub-stage stage-pad">
        <div className="ub-two">
          <CodePanel className="ub-code" title="As written (shown, not run)" lines={[returnLine]} gutter="none" />
          <CodePanel className="ub-code" title={type.signed ? 'After the toy rewriter (shown, not run)' : 'Unsigned: the rewrite is not applied'} lines={[type.signed ? 'int overflows(int x) { return 0; }' : returnLine]} gutter="none" stateOf={() => (type.signed ? 'add' : 'idle')} />
        </div>
        <div className="ub-bits">
          <span className="ub-bits-label">x</span>
          <BitStrip bits={toBits(x, type.width)} size="sm" groups={chunkGroups(type.width, 8)} toneOf={signBit} ariaLabel={`x as ${type.width} bits`} />
          <span className="ub-bits-label">x + 1 wrapped</span>
          <BitStrip bits={sumBits} size="sm" groups={chunkGroups(type.width, 8)} toneOf={signBit} ariaLabel={`x plus 1 as ${type.width} bits`} />
        </div>
        {type.signed && (
          <div className="ub-steps">
            <Segmented label="Why it is legal" value={step} onChange={setStep} options={Array.from({ length: STEPS }, (_, i) => ({ value: i + 1, label: `Step ${i + 1}` }))} />
            <p className="ub-step-text" role="status">{stepText(step, type)}</p>
          </div>
        )}
        {strip ? (
          <div className="ub-strip">
            <p className="ub-note">
              Every {typeName(type)} input, {num(2 ** type.width)} cells from {num(min)} to {num(max)}: {bad.length === 0 ? 'none differs.' : `${bad.length} differs, the one at ${num(bad[0])}, and it is outside the contract.`}
              {strip === 16 ? ' On a phone the cells shrink to a pixel or two, so the differing cell is ringed.' : ''}
            </p>
            <CellGrid
              rows={STRIP_SIDE[strip]}
              cols={STRIP_SIDE[strip]}
              size={{ cell: STRIP_CELL[strip], gap: strip === 8 ? 2 : 0 }}
              cell={(r, c) => {
                return cells[r * STRIP_SIDE[strip] + c];
              }}
              highlight={[{ ...cellOf(x), tone: 'hi' as const }, ...bad.map((v) => ({ ...cellOf(v), tone: 'bad' as const }))]}
              ariaLabel={`All ${num(2 ** type.width)} ${typeName(type)} inputs: green where both columns agree, red where they differ`}
            />
          </div>
        ) : (
          <p className="ub-note">A 32-bit input space has {num(2 ** 32)} values, too many to draw. The chips are the boundary values; the model is tested on them and on 10,000 seeded inputs.</p>
        )}
        <table className="data-table ub-table">
          <caption>The boundary values, both columns</caption>
          <thead>
            <tr><th>x</th><th>As written</th><th>{type.signed ? 'Assuming no overflow' : 'Rewrite not applied'}</th><th>Contract</th></tr>
          </thead>
          <tbody>
            {boundaryValues(type).map((v) => (
              <tr key={v} className={v === x ? 'ub-current' : undefined}>
                <td>{num(v)}</td>
                <td>{asWritten(v, type)}</td>
                <td style={{ color: differs(v, type) ? 'var(--bad)' : undefined }}>{assumingNoOverflow(v, type)}</td>
                <td>{isDefined(v, type) ? 'defined' : 'undefined'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint>Widths 8 and 16 model a narrower int so the whole input space can be drawn; real C promotes such types to int first.</Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy rewriter applying one rule by hand; it is not a compiler</Provenance>
        <Provenance kind="from-memory">GCC and Clang can do this at -O2 for signed int; verify on Compiler Explorer. No assembly is shown, and nothing here was compiled</Provenance>
        <Provenance kind="not-run">the C code is shown, not run; the wrap is computed with core/bits</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
