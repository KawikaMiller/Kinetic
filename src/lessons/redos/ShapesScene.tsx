import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { VISIT_DEFINITION, num, shapeRows, shapesCaption } from './captions';
import { BUDGET, MAX_TEXT_CHARS, backtrackVisits, growthSeries, parseText } from './engines';
import { SHAPES_FROM, SHAPES_TO, initialShapes } from './opening';
import { growthDetail, growthKind, growthText } from './growth';
import { PATTERNS, type PatternId } from './patterns';

const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 220;
const PLOT_FROM = 1;
const PLOT_TOP = BUDGET * 3;
const TONES = { linear: 'ok', quadratic: 'amber', fibonacci: 'orange', exponential: 'bad' } as const;
const COLOURS = { linear: 'var(--ok)', quadratic: 'var(--amber)', fibonacci: 'var(--orange)', exponential: 'var(--bad)' } as const;

const cell = (v: { visits: number; gaveUp: boolean }) => (v.gaveUp ? 'gave up' : num(v.visits));

/** Scene 2: four benign textbook patterns on the same input shape, and what makes each one grow the way it does. */
export function ShapesScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialShapes);
  const { pattern, text } = state;
  const selected = PATTERNS.find((p) => p.id === pattern)!;
  const series = useMemo(() => PATTERNS.map((p) => ({ p, points: growthSeries(p.source, SHAPES_FROM, SHAPES_TO), plot: growthSeries(p.source, PLOT_FROM, SHAPES_TO) })), []);
  const growth = useMemo(() => shapeRows(), []);
  const picked = growth.find((g) => g.id === pattern)!.growth;
  const typed = parseText(text);
  const [lastGood, setLastGood] = useState<string[]>(() => {
    const first = parseText(initialShapes().text);
    return first.ok ? first.value : [];
  });
  const subject = typed.ok ? typed.value : lastGood;
  const ownRuns = PATTERNS.map((p) => ({ p, run: backtrackVisits(p.source, subject) }));
  const type = (value: string) => {
    const parsed = parseText(value);
    if (parsed.ok) setLastGood(parsed.value);
    setState((s) => ({ ...s, text: value }));
  };
  const rows = Array.from({ length: SHAPES_TO - SHAPES_FROM + 1 }, (_, i) => SHAPES_FROM + i);

  return (
    <StageFrame
      height={430}
      intro={shapesCaption(pattern, text)}
      introKey={[pattern, text]}
      stats={
        <Stats>
          <Stat label={<span className="keep-case">{selected.shown}</span>} value={growthKind(picked)} color={COLOURS[pattern]} sub={growthDetail(picked)} />
        </Stats>
      }
      legend={
        <Legend
          items={PATTERNS.map((p) => ({ color: COLOURS[p.id], label: <code>{p.shown}</code>, shape: 'line' as const }))}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<PatternId> label="Explain" value={pattern} onChange={(v) => setState((s) => ({ ...s, pattern: v }))} options={PATTERNS.map((p) => ({ value: p.id, label: p.shown }))} />
        </>,
        <>
          <TextField label={`Your text (up to ${MAX_TEXT_CHARS} characters)`} value={text} onChange={type} width={300} spellCheck={false} maxLength={MAX_TEXT_CHARS * 2} />
          <Hint tone="muted" block>
            <span role="status" className="rd-status">
              {typed.ok ? null : <span className="rd-error">{typed.error} The last good text stays on show.</span>}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="rd-stage stage-pad">
        <p className="rd-note">{VISIT_DEFINITION} Each row is n letters <code>a</code> then <code>!</code>; the patterns are fixed, only the text is yours.</p>
        <div className="rd-two">
          <div className="rd-block">
            <SectionTitle>Visits measured by the backtracking matcher</SectionTitle>
            <table className="data-table rd-table">
              <thead>
                <tr>
                  <th>n</th>
                  {PATTERNS.map((p) => (
                    <th key={p.id} className={`keep-case ${p.id === pattern ? 'rd-picked' : ''}`}>
                      <code>{p.shown}</code>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((n, i) => (
                  <tr key={n}>
                    <td>{n}</td>
                    {series.map(({ p, points }) => (
                      <td key={p.id} className={`${p.id === pattern ? 'rd-picked' : ''} ${points[i].gaveUp ? 'rd-gave-up' : ''}`}>
                        {cell(points[i])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td>your text</td>
                  {ownRuns.map(({ p, run }) => (
                    <td key={p.id} className={`${p.id === pattern ? 'rd-picked' : ''} ${run.gaveUp ? 'rd-gave-up' : ''}`}>
                      {cell(run)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rd-block">
            <SectionTitle>Visits against letters (log scale)</SectionTitle>
            <Plot2D
              x={{ domain: [PLOT_FROM, SHAPES_TO], label: 'letters before the !' }}
              y={{ domain: [1, PLOT_TOP], log: true, ticks: 6, label: 'visits' }}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
              ariaLabel="Visits against letters for the four patterns: linear, quadratic, Fibonacci-like and doubling growth"
            >
              {series.map(({ p, plot }) => (
                <Curve key={p.id} points={plot.map((pt) => [pt.n, Math.max(1, pt.visits)] as const)} tone={TONES[p.id]} width={p.id === pattern ? 4 : 2} />
              ))}
            </Plot2D>
          </div>
        </div>
        <div className="rd-block">
          <SectionTitle>Growth read from the numbers (n = {SHAPES_FROM} to {SHAPES_TO})</SectionTitle>
          <ul className="rd-list">
            {PATTERNS.map((p) => (
              <li key={p.id}>
                <code>{p.shown}</code>: {growthText(growth.find((g) => g.id === p.id)!.growth)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">no real regex engine runs: a lesson-authored matcher counts its own steps</Provenance>
        <Provenance kind="toy">a small matcher; real engines add optimisations and sometimes memoisation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
