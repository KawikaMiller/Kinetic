import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { GraphView, type GraphNode, type Pt } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { BUG_LABEL, callFrames, overMockCaption, resultCaption, type CallFrame } from './frames';
import {
  BUGS, BUG_DEP, CLEAN, DEPS, DEP_NAME, FLAKY_EVERY, KINDS, checkoutLines, isDeterministic, overMockedTestLines, runConfig, runTest, sameEveryRun, taxLines, testLines,
  variantFor, verdict, type Bug, type Config, type Dep, type Kind, type TestRun, type Verdict,
} from './model';
import './styles.css';

type Scene = 'pick' | 'over';
const SCENES = [
  { value: 'pick' as const, label: 'Pick the doubles' },
  { value: 'over' as const, label: 'Over-mocking' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pick' });
  return scene === 'pick' ? <PickScene picker={picker} /> : <OverScene picker={picker} />;
}

// ── The dependency graph (both scenes) ──────────────────────────────

const STEP_MS = 1000;
const W = 560;
const H = 270;
const BOX = { w: 150, h: 44, rx: 10 };
const AT: Record<Dep | 'checkout', Pt> = {
  checkout: { x: W / 2, y: H / 2 - 10 },
  gateway: { x: 96, y: 46 },
  tax: { x: W - 96, y: 46 },
  email: { x: 96, y: H - 66 },
  clock: { x: W - 96, y: H - 66 },
};
const BADGE_DY = BOX.h / 2 + 15;
const isDouble = (k: Kind) => k !== 'real';

function DoublesGraph({ cfg, frame, trace }: { cfg: Config; frame: CallFrame; trace: TestRun['trace'] }) {
  const current = frame.call !== null ? trace[frame.call] : null;
  const nodes: GraphNode<string>[] = [
    { id: 'checkout', label: 'checkout()', at: AT.checkout, shape: 'box' },
    ...DEPS.map((d) => ({ id: d, label: DEP_NAME[d], at: AT[d], shape: 'box' as const })),
  ];
  const renderNode = (n: GraphNode<string>, p: Pt, base: ReactNode) => (
    <>
      {base}
      {n.id !== 'checkout' && (
        <text className={`td-badge ${isDouble(cfg[n.id as Dep]) ? 'is-double' : 'is-real'}`} x={p.x} y={p.y + BADGE_DY} textAnchor="middle">
          {cfg[n.id as Dep] === 'real' ? 'real' : `${cfg[n.id as Dep]}${cfg[n.id as Dep] === 'spy' ? ' (wraps real)' : ''}`}
        </text>
      )}
    </>
  );
  return (
    <WideRegion minWidth={520} label="Dependency graph: scroll sideways to see all of it">
      <GraphView
        nodes={nodes}
        edges={DEPS.map((d) => ({ from: 'checkout', to: d }))}
        directed
        width={W}
        height={H}
        box={BOX}
        className="td-graph"
        ariaLabel={`checkout and its four dependencies: ${DEPS.map((d) => `${DEP_NAME[d]} as ${cfg[d]}`).join(', ')}`}
        renderNode={renderNode}
        nodeMark={(id) => (id === 'checkout' ? { tone: 'hi', fill: 'solid' } : { tone: isDouble(cfg[id as Dep]) ? 'sky' : 'violet', fill: current?.dep === id ? 'solid' : 'tint', tint: 22 })}
        edgeMark={(e) => (current?.dep === e.to ? { tone: 'info', width: 4 } : null)}
      />
    </WideRegion>
  );
}

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'function under test' },
      { color: 'var(--info)', label: 'call in flight', shape: 'line' },
      { color: 'var(--violet)', label: 'real dependency' },
      { color: 'var(--sky)', label: 'test double (kind on its badge)' },
    ]}
  />
);

function consoleOf(r: TestRun | null, name: string): ConsoleLine[] {
  if (!r) return [];
  return [
    { text: `${r.passed ? '✓' : '✗'} ${name} (${r.ms} ms)`, tone: r.passed ? 'ok' : 'bad' },
    ...(r.error ? [{ text: `  ${r.error}`, tone: 'bad' as const }] : []),
    { text: `  ${plural(r.trace.length, 'call')}: ${r.trace.map((c) => `${c.dep}.${c.method}`).join(', ') || 'none'}`, tone: 'muted' },
  ];
}

function RunStats({ r, deterministic }: { r: TestRun | null; deterministic: boolean | null }) {
  return (
    <Stats>
      <Stat label="Time" value={r ? `${r.ms} ms` : '–'} color="var(--info)" sub="illustrative latencies" />
      <Stat label="Network" value={r ? (r.network ? 'yes' : 'no') : '–'} color={r?.network ? 'var(--bad)' : 'var(--ok)'} />
      <Stat label="Deterministic" value={deterministic === null ? '–' : deterministic ? 'yes' : 'no'} color={deterministic === false ? 'var(--bad)' : 'var(--ok)'} sub={`checked over ${FLAKY_EVERY} runs`} />
      <Stat label="Result" value={r ? (r.passed ? 'pass' : 'fail') : '–'} color={r ? (r.passed ? 'var(--ok)' : 'var(--bad)') : undefined} />
    </Stats>
  );
}

// ── Scene 1: pick a double per dependency ───────────────────────────

const DEFAULT_CFG: Config = { gateway: 'mock', tax: 'stub', email: 'mock', clock: 'stub' };
const VERDICT_TEXT: Record<Verdict, string> = { caught: 'caught', escaped: 'shipped', broken: 'fails anyway' };
const VERDICT_TONE: Record<Verdict, string> = { caught: 'ok', escaped: 'bad', broken: 'orange' };
const TEST_NAME = 'checkout charges the card, emails a receipt, returns it';

interface Ran {
  cfg: Config;
  bug: Bug;
  run: number;
  result: TestRun;
}

function PickScene({ picker }: { picker: ReactNode }) {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CFG);
  const [bug, setBug] = useState<Bug>('none');
  const [run, setRun] = useState(0);
  const [ran, setRan] = useState<Ran | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(<>checkout() needs four dependencies. Pick a stand-in for each, then press <b>Run the test</b>.</>);

  const fresh = ran && ran.bug === bug && DEPS.every((d) => ran.cfg[d] === cfg[d]) ? ran : null;
  const frames = useMemo<CallFrame[]>(
    () => (fresh ? callFrames(fresh.result, resultCaption(fresh.result, fresh.cfg, fresh.bug, fresh.run, fresh.bug === 'none' ? null : verdict(fresh.cfg, fresh.bug, fresh.run))) : [{ call: null, done: false }]),
    [fresh],
  );
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const shown = fresh && f.done ? fresh.result : null;
  const deterministic = useMemo(() => (fresh ? isDeterministic(fresh.cfg, fresh.bug) : null), [fresh]);

  const go = () => {
    const result = runConfig(cfg, bug, run);
    setRan({ cfg, bug, run, result });
    setRun(run + 1);
    player.queueNext({ play: true });
  };
  const pick = (d: Dep, k: Kind) => {
    setCfg({ ...cfg, [d]: k });
    setCaption(<>{DEP_NAME[d]} is now a <b>{k}</b>. Press <b>Run the test</b>.</>);
  };
  const plant = (b: Bug) => {
    setBug(b);
    setCaption(b === 'none' ? <>No bug planted.</> : <>Planted: <b>{BUG_LABEL[b]}</b>. Run the test to see if these doubles catch it.</>);
  };

  const testCode = testLines(cfg);
  const callDep = f.call !== null && fresh ? fresh.result.trace[f.call].dep : null;
  const v = variantFor(bug);
  const code = checkoutLines(v);

  return (
    <StageFrame
      player={fresh ? player : undefined}
      height={460}
      stats={<RunStats r={shown} deterministic={f.done ? deterministic : null} />}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <ControlGroup label="Plant a bug">
            {BUGS.map((b) => (
              <ChipButton key={b} tone={b === 'none' ? 'muted' : 'bad'} on={bug === b} onClick={() => plant(b)}>
                {BUG_LABEL[b]}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button variant="primary" onClick={go}>
            Run the test (run #{run + 1})
          </Button>
        </>,
      ]}
    >
      <div className="td stage-pad">
        <div className="td-top">
          <div className="td-graph-wrap">
            <DoublesGraph cfg={cfg} frame={f} trace={fresh?.result.trace ?? []} />
          </div>
          <div className="td-pickers">
            {DEPS.map((d) => (
              <Segmented key={d} label={DEP_NAME[d]} value={cfg[d]} onChange={(k) => pick(d, k)} options={KINDS.map((k) => ({ value: k, label: k }))} />
            ))}
          </div>
        </div>
        {bug !== 'none' && <Matrix cfg={cfg} bug={bug} run={fresh ? fresh.run : run} />}
        <div className="td-code">
          <CodePanel
            title={`checkout.js${bug === 'email' ? ' · planted: the email.send line is gone' : bug === 'twice' ? ' · planted: a second charge' : ''}`}
            lines={code}
            stateOf={(i) => (code[i].includes('left in after debugging') ? 'bad' : 'idle')}
          />
          <CodePanel
            title={`TaxService (real)${bug === 'tax' ? ' · planted: floor instead of round' : ''}`}
            lines={taxLines(bug === 'tax')}
            stateOf={(i) => (bug === 'tax' && taxLines(true)[i].includes('floor') ? 'bad' : 'idle')}
          />
          <CodePanel
            title="checkout.test.js"
            lines={testCode}
            stateOf={(i) => (callDep && testCode[i].trim().startsWith(`const ${callDep} =`) ? 'now' : 'idle')}
          />
          <ConsolePanel title="test runner" lines={consoleOf(shown, TEST_NAME)} empty={fresh ? 'running…' : 'not run with these doubles yet'} />
        </div>
        <Hint block>
          The &quot;real&quot; payment gateway, tax service, mail server and clock are simulated: their latency and failures are scripted
          (the gateway times out on every {FLAKY_EVERY}th run). The code and the test are real JavaScript and really run.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Matrix({ cfg, bug, run }: { cfg: Config; bug: Exclude<Bug, 'none'>; run: number }) {
  const dep = BUG_DEP[bug];
  const row = KINDS.map((k) => ({ k, v: verdict({ ...cfg, [dep]: k }, bug, run) }));
  return (
    <div className="td-matrix">
      <SectionTitle hint={`each cell runs the test with and without the bug, on run #${run + 1}`}>
        {BUG_LABEL[bug]}: which {DEP_NAME[dep]} double catches it?
      </SectionTitle>
      <table className="data-table">
        <thead>
          <tr>{row.map(({ k }) => <th key={k} className={k === cfg[dep] ? 'td-current' : ''}>{k}</th>)}</tr>
        </thead>
        <tbody>
          <tr>{row.map(({ k, v }) => <td key={k} className={`tone-${VERDICT_TONE[v]} td-verdict`}>{VERDICT_TEXT[v]}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Scene 2: over-mocking ───────────────────────────────────────────

const OVER_NAME = 'checkout (everything mocked)';

function OverScene({ picker }: { picker: ReactNode }) {
  const [gw, setGw] = useState<'mock' | 'fake'>('mock');
  const [tax, setTax] = useState<'mock' | 'fake'>('mock');
  const [refactor, setRefactor] = useState(false);
  const [ran, setRan] = useState<{ key: string; result: TestRun; deterministic: boolean } | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(<>Every dependency is mocked, with expectations copied from the code. The code has a real integration bug (it sends <code>currencyCode</code>). Press <b>Run the test</b>.</>);

  const key = `${gw}-${tax}-${refactor}`;
  const code = checkoutLines({ ...CLEAN, wrongField: true, useRate: refactor });
  const test = overMockedTestLines(gw, tax);
  const fresh = ran?.key === key ? ran : null;
  const cfg: Config = { gateway: gw, tax, email: 'mock', clock: 'mock' };
  const frames = useMemo<CallFrame[]>(
    () => (fresh ? callFrames(fresh.result, overMockCaption(fresh.result, gw, refactor)) : [{ call: null, done: false }]),
    [fresh, gw, refactor],
  );
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const shown = fresh && f.done ? fresh.result : null;

  const go = () => {
    const make = (run: number) => runTest({ checkout: code, test, roundingBug: false, run });
    setRan({ key, result: make(0), deterministic: sameEveryRun(make) });
    player.queueNext({ play: true });
  };
  const changed = (what: ReactNode) => setCaption(<>{what} Press <b>Run the test</b>.</>);

  return (
    <StageFrame
      player={fresh ? player : undefined}
      height={460}
      stats={<RunStats r={shown} deterministic={shown && fresh ? fresh.deterministic : null} />}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="PaymentGateway" value={gw} onChange={(v) => { setGw(v); changed(v === 'fake' ? <>The gateway is now a fake that, like the real API, rejects a request with no currency field.</> : <>The gateway is a mock again.</>); }}
            options={[{ value: 'mock', label: 'mock (copied from code)' }, { value: 'fake', label: 'fake (checks the currency field)' }]} />
          <Segmented label="TaxService" value={tax} onChange={(v) => { setTax(v); changed(<>TaxService is now a {v}.</>); }} options={[{ value: 'mock', label: 'mock' }, { value: 'fake', label: 'fake' }]} />
          <Toggle label="Harmless refactor" value={refactor} onChange={(v) => { setRefactor(v); changed(v ? <>checkout now asks for the tax <i>rate</i> and multiplies itself: same total, different calls.</> : <>Refactor undone.</>); }} off="taxFor()" on="rateFor()" />
          <Button variant="primary" onClick={go}>Run the test</Button>
        </>,
      ]}
    >
      <div className="td stage-pad">
        <DoublesGraph cfg={cfg} frame={f} trace={fresh?.result.trace ?? []} />
        <div className="td-code">
          <CodePanel title="checkout.js · planted integration bug: currencyCode" lines={code}
            stateOf={(i) => (code[i].includes('currencyCode') ? 'bad' : refactor && code[i].includes('rateFor') ? 'now' : 'idle')} />
          <CodePanel title="checkout.test.js" lines={test} stateOf={(i) => (test[i].includes('currencyCode') ? 'bad' : 'idle')} />
          <ConsolePanel title="test runner" lines={consoleOf(shown, OVER_NAME)} empty={fresh ? 'running…' : 'not run yet'} />
        </div>
        <Hint block>The real gateway is simulated; it rejects any request without a <code>currency</code> field, as the fake does.</Hint>
      </div>
    </StageFrame>
  );
}
