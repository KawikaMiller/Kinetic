import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { integer } from '../../core/format';
import { MODELS, type Model, type Snapshot } from '../../core/memModel';
import { explorePathSteps } from '../../core/traceFrames';
import { MachineView } from './MachineView';
import { ManualPanel } from './ManualPanel';
import {
  BASES, MODEL_LABEL, buildLitmus, editKey, emptyEdit, manipulationNote, reachLine, scCountText, setFence, setTag, table, targetKey, targetReach, verdict,
  type BaseId, type Edit,
} from './model';
import { OutcomeList } from './OutcomeList';
import { ProgramEditor } from './ProgramEditor';
import { RulesPanel } from './RulesPanel';

export type SceneKind = 'sb' | 'mp' | 'bites';
export interface SceneConfig {
  kind: SceneKind;
  /** The programs this scene offers (more than one shows preset chips). */
  presets: readonly BaseId[];
  lead: string;
}

const MODEL_OPTIONS = MODELS.map((m) => ({ value: m, label: MODEL_LABEL[m] }));
const TRACE_MIN_WIDTH = 420;

const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the next instruction' },
      { color: 'var(--info)', label: 'a store waiting in a buffer' },
      { color: 'var(--muted)', label: 'a value in memory' },
      { color: 'var(--violet)', label: 'a fence or an order tag' },
      { color: 'var(--bad)', label: 'an outcome SC cannot produce' },
      { color: 'var(--dim)', label: 'not reachable' },
    ]}
  />
);

interface State { baseId: BaseId; model: Model; edit: Edit; shown: { ctx: string; regsKey: string } | null }

function memoryChips(kind: SceneKind): ReactNode {
  if (kind === 'sb') {
    return <Provenance kind="from-memory">store buffering&apos;s 0 and 0 is allowed on x86 and is the textbook x86-TSO example (Sewell et al., CACM 2010); x86&apos;s full fence is mfence and Arm&apos;s is dmb. Verify against the paper and the architecture manuals</Provenance>;
  }
  if (kind === 'mp') {
    return <Provenance kind="from-memory">message passing&apos;s flag 1, data 0 is forbidden on x86 and allowed on ARM and POWER without barriers or ordered accesses (the Maranget, Sarkar and Sewell litmus catalogues); seq_cst store buffering forbids 0 and 0 in C++. Verify each against its source</Provenance>;
  }
  return <Provenance kind="from-memory">reading one location backwards (CoRR) is forbidden by the mainstream models; Dekker-style entry needs a full fence between the flag store and the check on x86-like machines. Verify against the litmus catalogues</Provenance>;
}

/** One litmus scene: edit the program, pick a model, read the outcome table, replay a schedule, or step the machine by hand. */
export function LitmusScene({ picker, config }: { picker: ReactNode; config: SceneConfig }) {
  const first = config.presets[0];
  const [s, setS] = useState<State>(() => ({ baseId: first, model: 'sc', edit: emptyEdit(BASES[first]), shown: null }));
  const base = BASES[s.baseId];
  const ctx = `${s.baseId}|${editKey(s.edit)}|${s.model}`;
  const litmus = useMemo(() => buildLitmus(base, s.edit), [base, s.edit]);
  const t = useMemo(() => table(base, s.edit, s.model), [base, s.edit, s.model]);
  const reach = useMemo(() => targetReach(base, s.edit), [base, s.edit]);
  const shownKey = s.shown?.ctx === ctx ? s.shown.regsKey : null;
  const row = t.rows.find((r) => r.regsKey === shownKey) ?? null;
  const steps = useMemo(() => (row ? explorePathSteps(row.example) : []), [row]);
  const note = manipulationNote(base, s.edit, s.model, reach[s.model]);
  const allowed = t.rows.filter((r) => r.reachable).length;
  const here = reach[s.model];
  const sentence = verdict(base, s.model, reach);

  const setBase = (baseId: BaseId) => setS({ baseId, model: s.model, edit: emptyEdit(BASES[baseId]), shown: null });
  const reset = () => setS({ baseId: first, model: 'sc', edit: emptyEdit(BASES[first]), shown: null });

  return (
    <StageFrame
      height={640}
      intro={<>{config.lead} {sentence} {note ?? ''}</>}
      introKey={`${config.kind}|${ctx}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Outcomes allowed" value={`${allowed} of ${t.rows.length}`} color="var(--info)" sub={`by the ${MODEL_LABEL[s.model]} model`} />
          <Stat label="States explored" value={integer(t.states)} color={t.truncated ? 'var(--bad)' : 'var(--ok)'} sub={t.truncated ? 'truncated: not exhaustive' : 'exhaustive'} />
          <Stat label="Surprising outcome" value={here.reachable ? 'allowed' : here.truncated ? 'not found' : 'not reachable'} color={here.reachable && t.rows.find((r) => r.isTarget)?.viaRelaxation ? 'var(--bad)' : 'var(--dim)'} sub={reachLine(reach)} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Model" value={s.model} onChange={(model) => setS({ ...s, model, shown: null })} options={MODEL_OPTIONS} />
          <Button onClick={reset}>Reset</Button>
        </>,
        ...(config.presets.length > 1
          ? [<>{config.presets.map((id) => <ChipButton key={id} on={s.baseId === id} onClick={() => setBase(id)}>{BASES[id].title}</ChipButton>)}</>]
          : []),
      ]}
    >
      <div className="moa-stage stage-pad">
        <RulesPanel model={s.model} />
        <Box>
          <SectionTitle hint={`${base.title}: add a fence in a gap${s.model === 'relaxed' ? ' or change an order tag' : ''}`}>The program</SectionTitle>
          <ProgramEditor
            base={base}
            edit={s.edit}
            model={s.model}
            onFence={(th, i, on) => setS({ ...s, edit: setFence(s.edit, th, i, on), shown: null })}
            onTag={(th, i, tag) => setS({ ...s, edit: setTag(s.edit, th, i, tag), shown: null })}
          />
          <p className="moa-note">The surprising outcome: {Object.entries(base.target).map(([k, v]) => `${k.split('.')[1]} = ${v}`).join(', ')}, where {base.targetMeaning}.</p>
          {note && <div className="moa-witness" role="status">{note}</div>}
        </Box>
        <Box>
          <SectionTitle hint="every outcome the program could end with, allowed by this model or not">Outcomes</SectionTitle>
          {s.model === 'sc' && <p className="moa-note">SC has {scCountText(litmus)}.</p>}
          <OutcomeList t={t} shown={shownKey} onShow={(regsKey) => setS({ ...s, shown: { ctx, regsKey } })} />
        </Box>
        {row && (
          <Box>
            <SectionTitle hint="the shortest schedule that ends with it">{`Replay: ${row.label}`}</SectionTitle>
            <WideRegion minWidth={TRACE_MIN_WIDTH}>
              <TracePlayer<Snapshot>
                initial={t.start}
                steps={steps}
                label={`Steps of the shortest schedule ending with ${row.label}`}
                renderState={(snap) => <MachineView litmus={litmus} snap={snap} model={s.model} />}
              />
            </WideRegion>
          </Box>
        )}
        {s.model !== 'relaxed' ? (
          <ManualPanel key={ctx} litmus={litmus} model={s.model} targetKey={targetKey(base)} targetMeaning={base.targetMeaning} />
        ) : (
          <Hint block tone="muted">Stepping by hand is offered for SC and x86-style. In the weak model a load chooses among several writes, so the table lists every outcome and &quot;show it&quot; replays the shortest schedule.</Hint>
        )}
        {config.kind === 'mp' && (
          <p className="moa-note">
            Code that is safe under x86-style ordering can break on weaker instruction sets. That is why release and acquire exist: the writer publishes what it had done, and the reader takes it over.
          </p>
        )}
        {config.kind === 'bites' && (
          <p className="moa-note">
            Coherence is per location, ordering is across locations: even the weak model never reads x backwards.
            Hardware does this because a store buffer hides the wait for a cache line (ownership transfer is in <Link to="/lesson/cache-coherence">cache coherence</Link>; the pipeline side is in <Link to="/lesson/cpu-pipelining">CPU pipelining</Link>). A fence costs cycles; this lesson does not put a number on them.
          </p>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated">outcomes are allowed by the model, not observed on any machine</Provenance>
          {memoryChips(config.kind)}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
