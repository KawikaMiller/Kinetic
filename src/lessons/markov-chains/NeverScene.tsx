import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { ChainGraph } from './ChainGraph';
import { PRESETS, analyse, distributionAt, pointMass, reachableFrom, stationarySolve } from './model';
import { conditionsOf, failureCaption, prob, verdictOf, verdictStat } from './text';

/** How far the distribution is followed. */
const MAX_STEPS = 30;
const BAR_INSET = 0.12;

export function NeverScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<(typeof PRESETS)[number]['id']>('periodic');
  const [start, setStart] = useState(0);
  const [t, setT] = useState(7);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const n = preset.P.length;
  const s = Math.min(start, n - 1);
  const analysis = useMemo(() => analyse(preset.P), [preset]);
  const pi = useMemo(() => stationarySolve(preset.P), [preset]);
  const mu = distributionAt(preset.P, pointMass(n, s), t);
  const reached = useMemo(() => reachableFrom(preset.P, s), [preset, s]);
  const verdict = verdictOf(analysis, preset.states);
  const verdictNote = verdictStat(analysis);
  const conditions = conditionsOf(analysis, preset.states);
  const caption = failureCaption(preset.label, analysis, preset.states, t, preset.states[s]);

  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={[presetId, s, t]}
      stats={
        <Stats>
          <Stat label="Chain" value={preset.label} sub={`${n} states`} />
          <Stat label="Verdict" value={verdictNote.value} color={verdict.tone === 'ok' ? 'var(--ok)' : 'var(--orange)'} sub={verdictNote.sub} />
          <Stat label="Stationary π" value={pi ? 'unique' : 'not unique'} color={pi ? 'var(--violet)' : 'var(--orange)'} sub={pi ? pi.map(prob).join(', ') : 'depends on where it starts'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the distribution at step t' },
            { color: 'var(--violet)', label: 'stationary π (when unique)', shape: 'line' },
            { color: 'var(--orange)', label: 'a failure to settle: a different kind of failure from an error' },
            { color: 'var(--dim)', label: 'a state that is never reached', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Chain" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone={p.id === 'weather' ? 'ok' : 'orange'} on={p.id === presetId} onClick={() => setPresetId(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Start" value={s} onChange={setStart} options={preset.states.map((name, i) => ({ value: i, label: name }))} />
          <Slider label="Step t" value={t} min={0} max={MAX_STEPS} onChange={setT} />
          <Hint>Slide t one step at a time and watch whether the bars settle. These bars are the distribution at step t, not a share of time: for the periodic chain they keep flipping while its share of time still reaches 50% and 50%.</Hint>
        </>,
      ]}
    >
      <div className="mc-stage stage-pad">
        <div className="mc-visual">
          <ChainGraph states={preset.states} P={preset.P} current={s} ariaLabel={`${preset.label}: ${preset.states.length} states`} />
        </div>
        <div className="mc-visual">
          <Plot2D
            x={{ domain: [0, n] as const, tickValues: preset.states.map((_, i) => i + 0.5), format: (v) => preset.states[Math.floor(v)] ?? '' }}
            y={{ domain: [0, 1] as const, label: 'probability', ticks: 5 }}
            ariaLabel={`Distribution at step ${t} starting from ${preset.states[s]}`}
          >
            <Bars bars={mu.map((p, i) => ({ x0: i + BAR_INSET, x1: i + 1 - BAR_INSET, y: p, tone: reached.has(i) ? 'info' : 'dim' }))} />
            {pi && <Segments segments={pi.map((p, i) => ({ from: [i + BAR_INSET / 2, p] as [number, number], to: [i + 1 - BAR_INSET / 2, p] as [number, number], tone: 'violet' as const }))} />}
          </Plot2D>
        </div>
        <div className="mc-visual mc-checks">
          <ul className="mc-conditions" aria-label="The three conditions">
            {conditions.map((c) => (
              <li key={c.name} className={!c.asked ? 'is-na' : c.met ? 'is-met' : 'is-unmet'}>
                <b>{!c.asked ? '–' : c.met ? '✓' : '✗'} {c.name}</b> <span>{c.detail}</span>
              </li>
            ))}
          </ul>
          <p className={`mc-verdict is-${verdict.tone}`}>{verdict.text}</p>
          <table className="mc-matrix" aria-label={`Distribution at step ${t} from each start`}>
            <thead>
              <tr>
                <th scope="col">start</th>
                {preset.states.map((name) => (
                  <th key={name} scope="col">{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preset.states.map((name, i) => {
                const row = distributionAt(preset.P, pointMass(n, i), t);
                return (
                  <tr key={name} className={i === s ? 'is-row' : undefined}>
                    <th scope="row">{name}</th>
                    {row.map((p, j) => (
                      <td key={preset.states[j]}>{prob(p)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the classes, the period and every distribution are computed from the matrix; the failures are produced by the model, not scripted</Provenance>
        <Provenance kind="illustrative">tiny invented chains</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
