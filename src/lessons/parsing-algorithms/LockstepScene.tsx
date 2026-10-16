import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { useMediaQuery } from '../../components/useMediaQuery';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { lockstepFrames } from './captions';
import { generates } from './earley';
import { GrammarEditor, TokenField } from './GrammarEditor';
import { OPENING, type ConflictPolicy } from './opening';
import { BottomUpPane, TopDownPane } from './panes';
import { PRESETS } from './presets';
import { runBottomUp, runTopDown } from './runs';
import { useGrammarInput, useParsingModel, useTokenInput } from './useGrammar';

const STEP_MS = 1100;
const NARROW_QUERY = '(max-width: 899px)';
type Pane = 'topdown' | 'bottomup';
const PANES: { value: Pane; label: string }[] = [
  { value: 'topdown', label: 'Top-down' },
  { value: 'bottomup', label: 'Bottom-up' },
];
const POLICIES: { value: ConflictPolicy; label: string }[] = [
  { value: 'shift', label: 'Shift' },
  { value: 'reduce', label: 'Reduce' },
];

/** Scene 3: both parsers on the same tokens, one step at a time. */
export function LockstepScene({ picker }: { picker: ReactNode }) {
  const grammarInput = useGrammarInput(OPENING.lockstep.preset);
  const tokenInput = useTokenInput(OPENING.lockstep.tokens);
  const [policy, setPolicy] = useState<ConflictPolicy>(OPENING.lockstep.policy);
  const [pane, setPane] = useState<Pane>('topdown');
  const narrow = useMediaQuery(NARROW_QUERY);
  const g = grammarInput.grammar;
  const model = useParsingModel(g);
  const tokens = tokenInput.tokens;
  const tdRun = useMemo(() => runTopDown(g, model.ll, tokens), [g, model, tokens]);
  const buRun = useMemo(
    () => runBottomUp(model.automaton, model.lr, tokens, (_cell, actions) => actions.find((a) => a.kind === policy) ?? actions[0]),
    [model, tokens, policy],
  );
  const frames = useMemo(() => lockstepFrames(tdRun, buRun), [tdRun, buRun]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const inLanguage = useMemo(() => generates(g, tokens), [g, tokens]);

  const preset = (id: string) => {
    grammarInput.loadPreset(id);
    tokenInput.load(PRESETS.find((p) => p.id === id)!.sample);
  };

  return (
    <StageFrame
      player={player}
      height={620}
      stats={
        <Stats>
          <Stat label="Top-down" value={`${tdRun.frames.length - 1} steps`} color="var(--info)" sub={tdRun.status} />
          <Stat label="Bottom-up" value={`${buRun.frames.length - 1} steps`} color="var(--violet)" sub={buRun.status} />
          <Stat label="In the language?" value={inLanguage ? 'yes' : 'no'} color="var(--muted)" sub="decided by a separate recogniser" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'top-down tree', shape: 'square' },
            { color: 'var(--violet)', label: 'bottom-up trees', shape: 'square' },
            { color: 'var(--hi)', label: 'symbol being expanded or shifted', shape: 'square' },
            { color: 'var(--ok)', label: 'matched or reduced', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Shift/reduce conflicts" value={policy} onChange={setPolicy} options={POLICIES} />
          {narrow ? <Segmented label="Parser" value={pane} onChange={setPane} options={PANES} /> : null}
        </>,
        <>
          <GrammarEditor input={grammarInput} analysis={model.analysis} onPreset={preset} />
        </>,
        <>
          <TokenField input={tokenInput} />
        </>,
      ]}
    >
      <div className="pa-stage stage-pad">
        <div className="pa-panes">
          {!narrow || pane === 'topdown' ? <TopDownPane run={tdRun} index={f.td} tokens={tokens} generated={inLanguage} /> : null}
          {!narrow || pane === 'bottomup' ? <BottomUpPane run={buRun} index={f.bu} tokens={tokens} generated={inLanguage} /> : null}
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">LL(1) and SLR(1) as in the textbook; a conflicted top-down cell takes its first rule, as hand-written recursive descent would</Provenance>
        <Provenance kind="from-memory">hand-written recursive descent and Pratt parsing dominate in practice: check before relying on it</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
