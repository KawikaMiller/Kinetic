import { useMemo, useState } from 'react';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { StageFrame } from '../../components/StageFrame';
import { useMediaQuery } from '../../components/useMediaQuery';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { applyFrames, planCaption, type ApplyFrame } from './frames';
import { apply, emptyWorld, plan as makePlan, type ApplyRun, type Plan, type World } from './model';
import { CloudPane, ConfigPane, StatePane } from './Panes';
import { parseConfig, type Config } from './parse';
import { PlanPanel } from './PlanPanel';
import { ResourceGraph } from './ResourceGraph';
import { scenarioById, SCENARIOS, type ScenarioId } from './scenarios';
import './styles.css';

const NARROW_QUERY = '(max-width: 900px)';
const APPLY_STEP_MS = 1100;
const applyLogRow = (r: ApplyRun['results'][number]): LogRow => ({
  id: `${r.step.op}-${r.step.address}`,
  tone: r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'bad' : 'dim',
  text: `${r.step.op} ${r.step.address}: ${r.message}`,
});
const IDLE: ApplyFrame[] = [{ done: 0, world: emptyWorld(), result: null }];

type Pane = 'config' | 'state' | 'world';
const PANES = [
  { value: 'config' as const, label: 'Config' },
  { value: 'state' as const, label: 'State' },
  { value: 'world' as const, label: 'Real world' },
];

interface Applied {
  plan: Plan;
  before: World;
  run: ApplyRun;
}

/** A config text that parsed (presets always do); an empty config otherwise. */
function configOf(text: string): Config {
  const r = parseConfig(text);
  return r.ok ? r.config : [];
}

export function Stage() {
  const first = scenarioById('fresh');
  const [scenario, setScenario] = useState<ScenarioId>('fresh');
  const [text, setText] = useState(first.text);
  const [config, setConfig] = useState<Config>(() => configOf(first.text));
  const [world, setWorld] = useState<World>(() => first.world());
  const [requested, setRequested] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [pane, setPane] = useState<Pane>('config');
  const narrow = useMediaQuery(NARROW_QUERY);
  const setCaption = useSetCaption();
  useIntroCaption(<>{first.blurb} Press Plan to see what the tool would do about it.</>);

  const parsed = useMemo(() => parseConfig(text), [text]);
  const error = parsed.ok ? null : parsed;
  const planned = useMemo(() => (requested ? makePlan(config, world) : null), [requested, config, world]);
  const frames = useMemo(() => (applied ? applyFrames(applied.before, applied.run) : IDLE), [applied]);
  const player = usePlayer(frames, { interval: APPLY_STEP_MS });

  const stepCount = applied?.run.steps.length ?? 0;
  const inSteps = applied !== null && player.index >= 1 && player.index <= stepCount;
  const shownWorld = applied ? player.frame.world : world;
  const results = applied ? applied.run.results.slice(0, player.frame.done) : [];
  const current = inSteps ? (player.frame.result?.step.address ?? null) : null;

  const load = (id: ScenarioId) => {
    const s = scenarioById(id);
    setScenario(id);
    setText(s.text);
    setConfig(configOf(s.text));
    setWorld(s.world());
    setRequested(false);
    setApplied(null);
    setCaption(<>{s.blurb} Press Plan to see what the tool would do about it.</>);
  };
  const edit = (next: string) => {
    setText(next);
    const r = parseConfig(next);
    if (r.ok) setConfig(r.config);
    setRequested(false);
    setApplied(null);
    setCaption(<>You edited the config. Press Plan to see what the tool would change.</>, { quiet: true });
  };
  const runPlan = () => {
    setApplied(null);
    setRequested(true);
    setCaption(planCaption(makePlan(config, world)));
  };
  const approve = () => {
    if (!planned) return;
    const run = apply(config, world, planned);
    setApplied({ plan: planned, before: world, run });
    setWorld(run.final);
    setRequested(false);
  };
  const reject = () => {
    setRequested(false);
    setCaption(<>Plan rejected. Nothing was applied: the state and the cloud are untouched.</>);
  };

  const panes = {
    config: <ConfigPane text={text} onChange={edit} error={error} planning={requested} />,
    state: <StatePane world={shownWorld} />,
    world: <CloudPane world={shownWorld} />,
  };

  return (
    <StageFrame
      player={applied ? player : undefined}
      height={560}
      stats={
        <Stats>
          <Stat label="In config" value={config.length} />
          <Stat label="In state" value={Object.keys(shownWorld.state).length} />
          <Stat label="In the cloud" value={Object.keys(shownWorld.cloud.objects).length} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: '+ create' },
            { color: 'var(--hi)', label: '~ update in place' },
            { color: 'var(--orange)', label: '-/+ replace, or drift' },
            { color: 'var(--bad)', label: '- destroy' },
            { color: 'var(--info)', label: 'resource' },
            { color: 'var(--dim)', label: 'no change' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="presets" label="Scenario" inline>
          {SCENARIOS.map((s) => (
            <ChipButton key={s.id} tone="info" on={scenario === s.id} onClick={() => load(s.id)}>
              {s.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Button variant="primary" onClick={runPlan}>
            Plan
          </Button>
          <Hint>
            {planned
              ? `${plural(planned.changes.filter((c) => c.action !== 'noop').length, 'resource')} would change.`
              : 'Plan changes nothing; only Approve and apply does.'}
          </Hint>
        </>,
      ]}
    >
      <div className="iac stage-pad">
        {narrow ? (
          <>
            <Segmented ariaLabel="Pane" value={pane} onChange={setPane} options={PANES} />
            {panes[pane]}
          </>
        ) : (
          <div className="iac-panes">
            {panes.config}
            {panes.state}
            {panes.world}
          </div>
        )}
        <PlanPanel plan={planned ?? applied?.plan ?? null} reviewing={applied === null} onApprove={approve} onReject={reject} />
        <ResourceGraph config={config} world={shownWorld} plan={applied ? applied.plan : planned} results={results} current={current} />
        {applied && <LogStream label="Apply output" empty="" rows={results.map(applyLogRow)} />}
        <Hint block>
          Simulated provider and cloud; the syntax is HCL-like, not a real tool's. Real tools also run independent steps in parallel, lock the state while they work and keep it in a
          shared place; here the steps run one at a time. Here every resource name must be unique, so a second create fails; many real providers would instead make a duplicate, or fail only for globally unique names such as buckets.
        </Hint>
      </div>
    </StageFrame>
  );
}
