import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { plural } from '../../core/format';
import { parseBoundedDecimal, parseBoundedInt } from '../../core/parse';
import { namesOf } from './ir';
import { aliasView, floatRow, reassocView, show } from './model';
import { DECIMAL_RANGE, FLOAT_CHIPS, INT32, INT_CHIPS, OPENING, xForType, type RefusalCase } from './opening';
import { algebra } from './passes';
import { ALIAS_PROGRAM, timesZero } from './programs';
import { IrCode } from './IrCode';

const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const CASES: { value: RefusalCase; label: string }[] = [
  { value: 'alias', label: 'Aliasing' },
  { value: 'float', label: 'Integer or float' },
  { value: 'reassoc', label: 'Reassociation' },
];

/** Scene 4: three places where a correct compiler declines to rewrite. */
export function RefusalScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<RefusalCase>(OPENING.refusals.kind);
  const restoreFocus = useRef(false);
  const choose = (next: RefusalCase) => {
    restoreFocus.current = document.activeElement !== null && document.activeElement !== document.body;
    setKind(next);
  };
  // each case is its own StageFrame, so switching unmounts the focused radio: put focus back on the chosen one
  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) document.querySelector<HTMLElement>('[aria-label="Refusal"] [aria-checked="true"]')?.focus();
  }, [kind]);
  const chooser = (
    <>
      {picker}
      <Segmented label="Refusal" value={kind} onChange={choose} options={CASES} />
    </>
  );
  if (kind === 'float') return <FloatCase key="float" chooser={chooser} />;
  if (kind === 'reassoc') return <ReassocCase key="reassoc" chooser={chooser} />;
  return <AliasCase key="alias" chooser={chooser} />;
}

function AliasCase({ chooser }: { chooser: ReactNode }) {
  const [same, setSame] = useState(OPENING.refusals.alias.same);
  const [promise, setPromise] = useState(OPENING.refusals.alias.promise);
  const view = useMemo(() => aliasView(same, promise), [same, promise]);
  const names = useMemo(() => namesOf(ALIAS_PROGRAM), []);
  const c = view.compared;
  const wrong = !c.same;
  return (
    <StageFrame
      height={420}
      intro={
        view.pass.refused.length > 0 ? (
          <>The compiler refuses: {view.pass.refused[0]}. Both versions return {c.beforeRun.value}.</>
        ) : wrong ? (
          <>The promise says p and q are distinct, but here they are the same address: the original returns {c.beforeRun.value} and the optimised code {c.afterRun.value}. The program lied, and the compiler is allowed to rely on it.</>
        ) : (
          <>The load was replaced by the stored value, so it executes {c.afterRun.loads} loads instead of {c.beforeRun.loads}, and the answer is still {c.afterRun.value}.</>
        )
      }
      introKey={`${same}-${promise}`}
      stats={
        <Stats>
          <Stat label="Original returns" value={c.beforeRun.value} color="var(--info)" sub={`${plural(c.beforeRun.loads, 'load')}, ${plural(c.beforeRun.stores, 'store')}`} />
          <Stat label="Optimised returns" value={c.afterRun.value} color={c.same ? 'var(--ok)' : 'var(--bad)'} sub={`${plural(c.afterRun.loads, 'load')}, ${plural(c.afterRun.stores, 'store')}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'rewritten, and the answer agrees', shape: 'square' }, { color: 'var(--bad)', label: 'the answer differs from the original', shape: 'square' }, { color: 'var(--orange)', label: 'a refused rewrite', shape: 'square' }]} />}
      controls={[
        chooser,
        <>
          <Toggle label="p and q" value={same} onChange={setSame} off="distinct addresses" on="the same address" />
          <Toggle label="Promise (restrict)" value={promise} onChange={setPromise} off="not made" on="p and q never overlap" />
        </>,
      ]}
    >
      <div className="co-stage stage-pad">
        <div className="co-two">
          <IrCode title="Original" lines={c.beforeListing.lines} names={names} stateOf={(i) => (c.diff.removed.has(i) ? 'del' : 'idle')} />
          <IrCode title="After forwarding the load" lines={c.afterListing.lines} names={names} stateOf={(i) => (c.diff.added.has(i) ? 'add' : 'idle')} />
        </div>
        {view.pass.refused.length > 0 && <p className="co-refused" role="note">Refused: {view.pass.refused[0]}.</p>}
        <table className="data-table co-table">
          <caption>All four combinations, run through the interpreter</caption>
          <thead>
            <tr><th>Promise</th><th>p and q</th><th>Original</th><th>Optimised</th><th>Agree</th></tr>
          </thead>
          <tbody>
            {view.cells.map((cell) => (
              <tr key={`${cell.promise}-${cell.same}`} className={cell.promise === promise && cell.same === same ? 'co-current' : undefined}>
                <td>{cell.promise ? 'made' : 'not made'}</td>
                <td>{cell.same ? 'same address' : 'distinct'}</td>
                <td>{cell.original}</td>
                <td>{cell.optimised}</td>
                <td style={{ color: cell.agree ? 'var(--ok)' : 'var(--bad)' }}>{cell.agree ? 'yes' : 'no: the promise was false'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">store-to-load forwarding in a toy optimiser, run by the toy interpreter</Provenance>
        <Provenance kind="from-memory">C's restrict qualifier makes this promise; breaking it is undefined behaviour, so the compiler may rely on it. Verify against the C standard</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

function FloatCase({ chooser }: { chooser: ReactNode }) {
  const [ty, setTy] = useState(OPENING.refusals.float.ty);
  const [x, setX] = useState(OPENING.refusals.float.x);
  const [draft, setDraft] = useState(String(OPENING.refusals.float.x));
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => namesOf(timesZero(ty)), [ty]);
  const pass = useMemo(() => algebra(timesZero(ty)), [ty]);
  const chips = ty === 'i32' ? INT_CHIPS : FLOAT_CHIPS;
  const row = floatRow(ty, x);
  const rewritten = pass.changed > 0;
  const counter = chips.filter((v) => !floatRow(ty, v).agree);

  const load = (v: number) => {
    setX(v);
    setDraft(show(v));
    setError(null);
  };
  const edit = (text: string) => {
    setDraft(text);
    const parsed =
      ty === 'i32'
        ? parseBoundedInt(text, { min: INT32.min, max: INT32.max })
        : parseBoundedDecimal(text, { ...DECIMAL_RANGE, messages: { tooBig: () => 'keep it within 1e300 either way; Infinity and NaN are the chips' } });
    if (parsed.ok) {
      setX(parsed.value);
      setError(null);
    } else setError(parsed.error);
  };
  const changeType = (next: 'i32' | 'f64') => {
    const nextX = xForType(x, next);
    setTy(next);
    setX(nextX);
    setDraft(show(nextX));
    setError(nextX === x ? null : `${show(x)} is not a 32-bit integer, so x resets to ${show(nextX)}`);
  };

  return (
    <StageFrame
      height={420}
      intro={
        rewritten ? (
          <>For 32-bit integers the compiler folds <code>x * 0</code> to 0: the product is 0 for every x, so nothing is lost ({chips.map(show).join(', ')} all give 0).</>
        ) : (
          <>For floats the compiler refuses to fold <code>x * 0</code> to 0. With x = {show(row.x)} the real result is {show(row.actual)}{row.agree ? ', which happens to be 0' : `, not 0, so folding would change the answer`}.{counter.length ? ` Among the chips, ${andList(counter.map(show))} would break.` : ''}</>
        )
      }
      introKey={`${ty}-${x}`}
      stats={
        <Stats>
          <Stat label={`x * 0 at ${ty === 'i32' ? '32-bit int' : 'float64'}`} value={show(row.actual)} color="var(--info)" sub={`real JavaScript, x = ${show(row.x)}`} />
          <Stat label="Folded to" value="0" color={row.agree ? 'var(--ok)' : 'var(--bad)'} sub={row.agree ? 'same answer' : 'a different answer'} />
          <Stat label="The pass" value={rewritten ? 'rewrites' : 'refuses'} color={rewritten ? 'var(--ok)' : 'var(--orange)'} sub={rewritten ? 'the product is always 0 in this type' : 'the reason is below'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'rewritten, same answer', shape: 'square' }, { color: 'var(--bad)', label: 'folding would change the answer', shape: 'square' }, { color: 'var(--orange)', label: 'a refused rewrite', shape: 'square' }]} />}
      controls={[
        chooser,
        <>
          <Toggle label="Type of x" value={ty === 'f64'} onChange={(v) => changeType(v ? 'f64' : 'i32')} off="32-bit int" on="float64" />
          <TextField label="x" value={draft} onChange={edit} width={110} spellCheck={false} />
          {chips.map((v) => (
            <ChipButton key={String(v)} tone="info" on={Object.is(x, v)} onClick={() => load(v)}>{show(v)}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'Infinity and NaN are chips: they cannot be typed.'}</span></Hint>
        </>,
      ]}
    >
      <div className="co-stage stage-pad">
        <div className="co-two">
          <IrCode title="Original" lines={['entry:', `  r = mul x, 0`, '  ret r']} names={names} />
          <IrCode title={rewritten ? 'After algebraic simplification' : 'After (unchanged)'} lines={['entry:', rewritten ? '  r = copy 0' : '  r = mul x, 0', '  ret r']} names={names} stateOf={(i) => (rewritten && i === 1 ? 'add' : 'idle')} />
        </div>
        {pass.refused.length > 0 && <p className="co-refused" role="note">Refused: {pass.refused[0]}.</p>}
        <table className="data-table co-table">
          <caption>x * 0 for the chips, in real JavaScript</caption>
          <thead>
            <tr><th>x</th><th>x * 0</th><th>is +0 (Object.is)</th></tr>
          </thead>
          <tbody>
            {chips.map((v) => {
              const r = floatRow(ty, v);
              return (
                <tr key={String(v)} className={Object.is(x, v) ? 'co-current' : undefined}>
                  <td>{show(v)}</td>
                  <td>{show(r.actual)}</td>
                  <td style={{ color: r.agree ? 'var(--ok)' : 'var(--bad)' }}>{r.agree ? 'yes' : 'no'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">x * 0 and the table are real JavaScript arithmetic, run in your browser</Provenance>
        <Provenance kind="toy">the rewrite is one rule of a toy optimiser</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

function ReassocCase({ chooser }: { chooser: ReactNode }) {
  const [vals, setVals] = useState({ a: OPENING.refusals.reassoc.a, b: OPENING.refusals.reassoc.b, c: OPENING.refusals.reassoc.c });
  const [drafts, setDrafts] = useState({ a: String(OPENING.refusals.reassoc.a), b: String(OPENING.refusals.reassoc.b), c: String(OPENING.refusals.reassoc.c) });
  const [allow, setAllow] = useState(OPENING.refusals.reassoc.allow);
  const [error, setError] = useState<string | null>(null);
  const r = reassocView(vals.a, vals.b, vals.c);

  const edit = (key: 'a' | 'b' | 'c', text: string) => {
    setDrafts({ ...drafts, [key]: text });
    const parsed = parseBoundedDecimal(text, { ...DECIMAL_RANGE, messages: { invalid: () => `${key} must be a plain decimal such as 10000000000000000 (no exponent)` } });
    if (parsed.ok) {
      setVals({ ...vals, [key]: parsed.value });
      setError(null);
    } else setError(parsed.error);
  };
  const plain = (n: number) => (Math.abs(n) >= 1e21 || (n !== 0 && Math.abs(n) < 1e-6) ? n.toExponential() : String(n));

  return (
    <StageFrame
      height={380}
      intro={
        r.differ ? (
          <>With a = {plain(vals.a)}, b = {plain(vals.b)}, c = {plain(vals.c)}, the grouping changes the answer: {show(r.left)} one way and {show(r.right)} the other.{allow ? ' With reassociation allowed the compiler may pick either grouping, so either answer is possible.' : ' Reassociation is off by default, so the compiler keeps the grouping you wrote.'}</>
        ) : (
          <>For these three numbers both groupings give {show(r.left)}. Try 10000000000000000, -10000000000000000 and 1 to see them differ.</>
        )
      }
      introKey={`${vals.a}-${vals.b}-${vals.c}-${allow}`}
      stats={
        <Stats>
          <Stat label="(a + b) + c" value={show(r.left)} color="var(--info)" sub="as written" />
          <Stat label="a + (b + c)" value={show(r.right)} color={r.differ ? 'var(--bad)' : 'var(--info)'} sub={r.differ ? 'differs from the first' : 'same as the first'} />
          <Stat label="Compiler may return" value={allow && r.differ ? `${show(r.left)} or ${show(r.right)}` : show(r.left)} color={allow && r.differ ? 'var(--orange)' : 'var(--ok)'} sub={allow ? 'reassociation allowed' : 'reassociation off, the default'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a grouping, in real JavaScript', shape: 'square' }, { color: 'var(--bad)', label: 'the grouping that gives a different answer', shape: 'square' }, { color: 'var(--orange)', label: 'a result the compiler may pick between', shape: 'square' }]} />}
      controls={[
        chooser,
        <>
          <TextField label="a" value={drafts.a} onChange={(t) => edit('a', t)} width={170} spellCheck={false} />
          <TextField label="b" value={drafts.b} onChange={(t) => edit('b', t)} width={170} spellCheck={false} />
          <TextField label="c" value={drafts.c} onChange={(t) => edit('c', t)} width={90} spellCheck={false} />
        </>,
        <>
          <Toggle label="Floating-point reassociation" value={allow} onChange={setAllow} off="off (default)" on="allowed (-ffast-math)" />
          <Hint><span role="status">{error ?? 'Plain decimals only; the defaults are the example where the grouping matters.'}</span></Hint>
        </>,
      ]}
    >
      <div className="co-stage stage-pad">
        <table className="data-table co-table">
          <caption>Two groupings of one sum, in real JavaScript</caption>
          <thead>
            <tr><th>Expression</th><th>Result</th></tr>
          </thead>
          <tbody>
            <tr><td>(a + b) + c</td><td>{show(r.left)}</td></tr>
            <tr><td>a + (b + c)</td><td style={{ color: r.differ ? 'var(--bad)' : undefined }}>{show(r.right)}</td></tr>
          </tbody>
        </table>
        <p className="co-note">Floating-point addition rounds after every step, so it is not associative. Regrouping is a flag in GCC and Clang (<code>-ffast-math</code> turns it on), off by default.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">both sums are real JavaScript arithmetic</Provenance>
        <Provenance kind="from-memory">reassociation is allowed by -ffast-math in GCC and Clang and off by default; verify against their documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
