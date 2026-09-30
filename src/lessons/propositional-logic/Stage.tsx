import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TruthTable, type TruthColumn } from '../../components/TruthTable';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { plural } from '../../core/format';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { truthRows, type TruthRow } from '../../core/truth';
import {
  PRESETS, evaluate, mismatchRows, parseFormula, toJsParts, toText, traceJs, variablesOf, type Formula, type Preset, type Variable,
} from './model';
import './styles.css';

type Slot = 0 | 1;
type Names = Partial<Record<Variable, string>>;

/** Keypad chips: what they show, and what they type into the active formula. */
const KEYS: { label: string; insert: string }[] = [
  { label: 'p', insert: 'p' }, { label: 'q', insert: 'q' }, { label: 'r', insert: 'r' },
  { label: '¬', insert: '¬' }, { label: '∧', insert: ' ∧ ' }, { label: '∨', insert: ' ∨ ' },
  { label: '→', insert: ' → ' }, { label: '↔', insert: ' ↔ ' }, { label: '(', insert: '(' }, { label: ')', insert: ')' },
];

const tf = (v: boolean) => (v ? 'T' : 'F');

export function Stage() {
  const [formulas, setFormulas] = useState<[string, string]>(PRESETS[0].formulas);
  const [names, setNames] = useState<Names>(PRESETS[0].names);
  const [presetId, setPresetId] = useState<string | null>(PRESETS[0].id);
  const [active, setActive] = useState<Slot>(0);
  const [row, setRow] = useState(PRESETS[0].row);
  const setCaption = useSetCaption();

  const parsed = formulas.map((s) => (s.trim() ? parseFormula(s) : null));
  const good = parsed.map((p) => (p?.ok ? p.formula : null));
  const errors = parsed.map((p) => (p && !p.ok ? p.error : null));
  const shown = good.filter((f): f is Formula => f !== null);
  const vars = shown.length ? variablesOf(...shown) : [];
  const rows = truthRows(vars);
  const current = Math.min(row, Math.max(0, rows.length - 1));
  const both = good[0] && good[1] ? ([good[0], good[1]] as const) : null;
  const diff = both ? mismatchRows(both[0], both[1], vars) : [];

  useIntroCaption(
    <>Two formulas, one truth table. Every row is one possible world; red rows are where the formulas disagree. Pick a
      preset, or build your own with the keypad.</>,
  );

  const columns: TruthColumn[] = good.flatMap((f, i) =>
    f ? [{ label: <span className={`pl-col pl-col-${i}`}>{toText(f)}</span>, fn: (r: TruthRow) => evaluate(f, r) }] : [],
  );

  const edit = (slot: Slot, text: string) => {
    const next: [string, string] = [...formulas];
    next[slot] = text;
    setFormulas(next);
    setPresetId(null);
  };

  const press = (insert: string) => edit(active, formulas[active] + insert);
  const backspace = () => edit(active, formulas[active].trimEnd().slice(0, -1).trimEnd());

  const load = (p: Preset) => {
    setFormulas(p.formulas);
    setNames(p.names);
    setPresetId(p.id);
    setRow(p.row);
    setActive(0);
    setCaption(presetCaption(p));
  };

  const clearAll = () => {
    setFormulas(['', '']);
    setNames({});
    setPresetId(null);
    setActive(0);
    setCaption(<>Blank slate. Build F1 with the keypad, then a second formula in F2 to compare them.</>);
  };

  const pickRow = (i: number) => {
    setRow(i);
    const r = rows[i];
    if (r) setCaption(rowCaption(presetId, good, r, vars));
  };

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          {good.map((f, i) =>
            f && rows[current] ? (
              <Stat key={i} label={`F${i + 1} on this row`} value={tf(evaluate(f, rows[current]))} color={evaluate(f, rows[current]) ? 'var(--ok)' : 'var(--muted)'} />
            ) : null,
          )}
          {both && (
            <Stat
              label="Equivalent?"
              value={diff.length ? 'No' : 'Yes'}
              color={diff.length ? 'var(--bad)' : 'var(--ok)'}
              sub={diff.length ? `${plural(diff.length, 'row')} differ` : `same on all ${rows.length} rows`}
            />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'T (true)' },
            { color: 'var(--faint)', label: 'F (false)' },
            { color: 'var(--hi)', label: 'row being evaluated' },
            { color: 'var(--bad)', label: 'formulas disagree' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} size="md" on={presetId === p.id} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          {([0, 1] as Slot[]).map((slot) => (
            <div key={slot} className="pl-slot">
              <TextField
                label={`F${slot + 1}${slot === 1 ? ' (optional)' : ''}`}
                value={formulas[slot]}
                onChange={(t) => edit(slot, t)}
                width={190}
                spellCheck={false}
                placeholder={slot === 0 ? 'p → q' : 'compare with…'}
                className={active === slot ? 'pl-field is-active' : 'pl-field'}
              />
              {errors[slot] && <Hint className="pl-error">{errors[slot]}</Hint>}
            </div>
          ))}
        </>,
        <>
          <Segmented label="Keypad types into" value={active} onChange={setActive} options={[{ value: 0, label: 'F1' }, { value: 1, label: 'F2' }]} />
          <ControlGroup label="Keypad">
            {KEYS.map((k) => (
              <ChipButton key={k.label} tone="info" onClick={() => press(k.insert)} title={`Type ${k.label.trim()}`}>
                {k.label}
              </ChipButton>
            ))}
            <ChipButton onClick={backspace} title="Delete the last character">⌫</ChipButton>
            <ChipButton onClick={clearAll} title="Clear both formulas">clear</ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad pl">
        {columns.length ? (
          <TruthTable
            className="pl-table"
            vars={vars}
            columns={columns}
            currentRow={current}
            mismatchRows={diff}
            onRowClick={(_, i) => pickRow(i)}
          />
        ) : (
          <p className="empty-note pl-empty">Type a formula in F1 to see its truth table.</p>
        )}
        {shown.length > 0 && rows[current] && <JsPane formulas={good} names={names} row={rows[current]} vars={vars} />}
      </div>
    </StageFrame>
  );
}

/** The formulas as JavaScript conditions, and how JS evaluates them on the chosen row. */
function JsPane({ formulas, names, row, vars }: { formulas: (Formula | null)[]; names: Names; row: TruthRow; vars: Variable[] }) {
  const jsName = (v: Variable) => names[v] ?? v;
  const lines = [
    `// ${vars.map((v) => `${jsName(v)} = ${row[v]}`).join(', ')}`,
    ...formulas.flatMap((f, i) => (f ? [`if (${toJsParts(f, names).map((p) => p.text).join('')}) …   // F${i + 1}`] : [])),
  ];
  return (
    <Box className="pl-js">
      <CodePanel title="As a JavaScript condition" lines={lines} gutter="none" />
      <SectionTitle hint="dim, struck-through parts never run">How JS evaluates it on this row</SectionTitle>
      {formulas.map((f, i) => (f ? <TraceLine key={i} label={`F${i + 1}`} formula={f} names={names} row={row} /> : null))}
    </Box>
  );
}

function TraceLine({ label, formula, names, row }: { label: string; formula: Formula; names: Names; row: TruthRow }) {
  const trace = traceJs(formula, row);
  return (
    <p className="pl-trace">
      <span className="pl-trace-label">{label}</span>
      <code>
        {toJsParts(formula, names).map((part, k) => (
          <span key={k} className={trace.skipped.has(part.id) ? 'pl-skipped' : undefined}>
            {part.text}
          </span>
        ))}
      </code>
      <span className={`pl-result ${trace.value ? 'is-true' : 'is-false'}`}>→ {String(trace.value)}</span>
    </p>
  );
}

function presetCaption(p: Preset): ReactNode {
  switch (p.id) {
    case 'converse':
      return <>"If it's raining, the street is wet" is <b>not</b> the same claim as "if the street is wet, it's raining" (a
        sprinkler would do it). The red rows are exactly those worlds.</>;
    case 'contrapositive':
      return <>The contrapositive "if the street isn't wet, it isn't raining" says the same thing: no red rows, on any
        world. That's the version you can safely swap in.</>;
    case 'vacuous':
      return <>p → q only makes a promise about worlds where p is true. When p is false it's <span className="hl ok">true
        automatically</span>: "every admin can delete users" is true when there are no admins.</>;
    case 'refactor':
      return <>Is <code>if (!(a &amp;&amp; b))</code> safe to rewrite as <code>if (!a || !b)</code>? The table checks every
        case: no red rows, so yes. That's De Morgan's law.</>;
    case 'short-circuit':
      return <>With <code>user &amp;&amp; user.name</code>, JavaScript stops as soon as it knows the answer. When user is
        false it <b>never evaluates</b> user.name, so a missing user can't throw a TypeError.</>;
    default:
      return null;
  }
}

function rowCaption(presetId: string | null, fs: (Formula | null)[], row: TruthRow, vars: Variable[]): ReactNode {
  const world = vars.map((v) => `${v}=${tf(row[v])}`).join(', ');
  if (presetId === 'short-circuit') {
    return row.p ? (
      <>{world}: user is truthy, so JS has to look at user.name too. Both sides run.</>
    ) : (
      <>{world}: user is false, so <code>&amp;&amp;</code> already knows the answer is false. <span className="hl">user.name
        never runs</span>.</>
    );
  }
  if (presetId === 'vacuous' && !row.p) {
    return <>{world}: p is false, so p → q is true whatever q is. Nothing was promised about this world.</>;
  }
  const [a, b] = fs;
  if (a && b) {
    const va = evaluate(a, row);
    const vb = evaluate(b, row);
    return va === vb ? (
      <>{world}: both formulas are {tf(va)}. They agree on this row.</>
    ) : (
      <>{world}: F1 is {tf(va)} but F2 is <span className="hl bad">{tf(vb)}</span>. One disagreeing row is enough to prove
        they're different.</>
    );
  }
  const f = a ?? b;
  return f ? <>{world}: the formula is <b>{tf(evaluate(f, row))}</b>.</> : null;
}
