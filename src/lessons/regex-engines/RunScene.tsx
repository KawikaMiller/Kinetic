import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { growthTable, runNfa, subsetSizes, type RunMode } from './engines';
import { runFrames } from './frames';
import { NfaDrawing } from './NfaDrawing';
import { OPENING, PRESETS } from './opening';
import { PresetChips, RegexFields } from './RegexFields';
import { constructionOf, placeNfa } from './thompson';
import { useRegexInput } from './useRegexInput';

const RUN_INTERVAL_MS = 900;
const MODES: { value: RunMode; label: string }[] = [
  { value: 'full', label: 'Full match' },
  { value: 'search', label: 'Search' },
];
const GROWTH = growthTable();
/** Every node of any pattern is visible in this scene: the machine is finished. */
const WHOLE_MACHINE = Number.MAX_SAFE_INTEGER;

/** Scene 2: the machine runs as a set of states, one character at a time. */
export function RunScene({ picker }: { picker: ReactNode }) {
  const input = useRegexInput(OPENING.run.pattern, OPENING.run.subject, { automaton: true });
  const [mode, setMode] = useState<RunMode>(OPENING.run.mode);
  const construction = useMemo(() => constructionOf(input.parsed), [input.parsed]);
  const placement = useMemo(() => placeNfa(construction), [construction]);
  const run = useMemo(() => runNfa(construction, input.subject, mode), [construction, input.subject, mode]);
  const frames = useMemo(() => runFrames(construction, input.subject, run, mode), [construction, input.subject, run, mode]);
  const player = usePlayer(frames, { interval: RUN_INTERVAL_MS, autoplayOnChange: false });
  const f = player.frame;
  const sizes = useMemo(() => subsetSizes(construction), [construction]);
  const n = input.subject.length;
  const states = construction.nfa.states.length;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Lit states" value={f.set.length} color="var(--hi)" sub={`of ${states} in the machine`} />
          <Stat label="Work so far" value={f.work} color="var(--info)" sub={`${plural(n, 'character')} x ${plural(states, 'state')} is at most ${n * states}`} />
          <Stat label="DFA states" value={sizes.dfaStates} color="var(--violet)" sub={`the same machine as a DFA (NFA: ${sizes.nfaStates})`} />
          <Stat
            label="Verdict"
            value={f.verdict === null ? 'reading' : f.verdict ? 'match' : 'no match'}
            color={f.verdict === null ? 'var(--muted)' : f.verdict ? 'var(--ok)' : 'var(--bad)'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'lit state', shape: 'dot' },
            { color: 'var(--ok)', label: 'accepting state lit', shape: 'dot' },
            { color: 'var(--info)', label: 'arrow that consumes a character', shape: 'line' },
            { color: 'var(--dim)', label: 'ε arrow (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips presets={PRESETS} input={input} />
          <Segmented label="Mode" value={mode} onChange={setMode} options={MODES} />
        </>,
        <>
          <RegexFields input={input} />
        </>,
      ]}
    >
      <div className="re-stage stage-pad">
        <NfaDrawing
          construction={construction}
          placement={placement}
          visibleTo={WHOLE_MACHINE}
          lit={new Set(f.set)}
          taken={f.taken}
          ends
          ariaLabel={`NFA for ${input.parsed.source} after reading ${f.read} of ${n} characters, ${f.set.length} states lit`}
        />
        <div className="re-strip">
          <SectionTitle>Subject</SectionTitle>
          {n ? (
            <ArrayStrip
              values={input.subject}
              cellMax={44}
              cellState={(i) => (i === f.read - 1 ? 'active' : i < f.read - 1 ? 'dim' : 'idle')}
            />
          ) : (
            <p className="empty-note">the empty subject: nothing to read</p>
          )}
        </div>
        <Tray label="Lit states" empty="none" ariaLabel="Lit states">
          {[...f.set].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((s) => (
            <span key={s} className={`re-chip ${construction.nfa.accept.includes(s) ? 'is-accept' : ''}`}>
              {s.slice(1)}
            </span>
          ))}
        </Tray>
        <div className="re-subset">
          <SectionTitle>The same machine as a DFA</SectionTitle>
          <p className="re-note">
            Subset construction turns this {sizes.nfaStates}-state NFA into a {sizes.dfaStates}-state DFA, which lights one state per character: faster per character. The DFA can be much bigger, as these patterns show (each adds one {'[ab]'} at the end):
          </p>
          <table className="data-table re-growth">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>NFA states</th>
                <th>DFA states</th>
              </tr>
            </thead>
            <tbody>
              {GROWTH.map((g) => (
                <tr key={g.k}>
                  <td>
                    <code>{g.pattern}</code>
                  </td>
                  <td>{g.nfaStates}</td>
                  <td>{g.dfaStates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">the NFA and the subset DFA are this lesson's own</Provenance>
        <Provenance kind="illustrative">work counts state-reads of this simulation, not the speed of any real engine</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
