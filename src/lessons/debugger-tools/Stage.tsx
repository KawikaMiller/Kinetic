import { useState, type ReactNode } from 'react';
import { CallStackPanel } from '../../components/CallStackPanel';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { Button, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { changedVars, move, scopeOf, stepsToLineByStepInto, type Action, type Breakpoint, type BreakpointKind, type ConsoleEntry, type Move } from './debugger';
import { evaluate, preview, type Scope } from './expr';
import { INLINE_VARS, L, PAUSABLE, SOURCE, TRACE, fnOfLine, type FrameSnap, type Pause } from './program';
import { BreakpointDot, CheatSheet, ScopePane, WatchPane, type ScopeSection } from './panels';
import './styles.css';

type Scene = 'debug' | 'sheet';
const SCENES = [
  { value: 'debug' as const, label: 'Debug checkout()' },
  { value: 'sheet' as const, label: 'Real shortcuts' },
];

const TOOLS: { value: BreakpointKind; label: string }[] = [
  { value: 'break', label: 'Breakpoint' },
  { value: 'cond', label: 'Conditional' },
  { value: 'log', label: 'Logpoint' },
];

const CONTROLS: { action: Action; label: string; title: string }[] = [
  { action: 'resume', label: '▶ Resume', title: 'Resume: F8 in DevTools, F5 in VS Code' },
  { action: 'over', label: '↷ Step over', title: 'Step over: F10' },
  { action: 'into', label: '↓ Step into', title: 'Step into: F11' },
  { action: 'out', label: '↑ Step out', title: 'Step out: Shift+F11' },
];

const STARTING_BREAKPOINTS: Breakpoint[] = [{ line: L.callSubtotal, kind: 'break', text: '' }];
const BRUTE_FORCE = stepsToLineByStepInto(TRACE, L.bug);
const NOT_STARTED = -1;
const lineNo = (line: number) => line + 1;

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'debug' });
  return scene === 'debug' ? <Debugger picker={picker} /> : <Sheet picker={picker} />;
}

function Sheet({ picker }: { picker: ReactNode }) {
  useIntroCaption(<>Everything you just did works the same in Chrome DevTools and VS Code, with these keys.</>);
  return (
    <StageFrame controls={[picker]}>
      <div className="stage-pad">
        <CheatSheet />
      </div>
    </StageFrame>
  );
}

/** Where execution is: not started, paused at a pause index, or finished. */
type Position = number | null;

function Debugger({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [at, setAt] = useState<Position>(NOT_STARTED);
  const [before, setBefore] = useState<Position>(NOT_STARTED);
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>(STARTING_BREAKPOINTS);
  const [tool, setTool] = useState<BreakpointKind>('break');
  const [condText, setCondText] = useState('i === 3');
  const [logText, setLogText] = useState("'total', total");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [watches, setWatches] = useState(['total', 'items.length', 'total * 0.9']);
  const [presses, setPresses] = useState(0);
  const [found, setFound] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');

  useIntroCaption(
    <>The receipt should say 81 (90 minus 10%), but this program prints <span className="hl bad">72.9</span>. There's a breakpoint on
      line {lineNo(L.callSubtotal)}: press <b>Resume</b> to start, then step through and find the line where the total goes wrong.</>,
  );

  const paused = at !== null && at !== NOT_STARTED;
  const pause: Pause | null = paused ? TRACE.pauses[at] : null;
  const frame: FrameSnap | null = pause ? (pause.stack.find((f) => f.id === selectedId) ?? pause.stack[0]) : null;
  const scope: Scope | null = pause && frame ? scopeOf(pause, frame) : null;
  const ranUpTo = at === null ? TRACE.pauses.length - 1 : at;
  const ran = new Set(TRACE.pauses.slice(0, ranUpTo + 1).map((p) => p.line));
  const prevFrame = before !== null && before !== NOT_STARTED && frame ? TRACE.pauses[before].stack.find((f) => f.id === frame.id) : undefined;
  const changed = frame && selectedId === null ? changedVars(prevFrame, frame) : new Set<string>();
  const bpAt = new Map(breakpoints.map((b) => [b.line, b]));

  const act = (action: Action) => {
    const from = at ?? NOT_STARTED;
    const m = move(TRACE, from, action, breakpoints);
    setBefore(from);
    setAt(m.to);
    setSelectedId(null);
    setPresses((n) => n + 1);
    setEntries((e) => [...e, ...m.printed]);
    setCaption(describe(action, from, m));
  };

  const restart = () => {
    setEntries([]);
    setPresses(0);
    setFound(null);
    const m = move(TRACE, NOT_STARTED, 'resume', breakpoints);
    setBefore(NOT_STARTED);
    setAt(m.to);
    setSelectedId(null);
    setEntries(m.printed);
    setCaption(<>Restarted from the top. {describe('resume', NOT_STARTED, m)}</>);
  };

  const toggle = (line: number) => {
    // Like DevTools, a click on a line with nothing to pause on moves to the next line that has one.
    let target = line;
    while (target < SOURCE.length && !PAUSABLE.has(target)) target++;
    if (target >= SOURCE.length) return;
    const existing = bpAt.get(target);
    if (existing) {
      setBreakpoints(breakpoints.filter((b) => b.line !== target));
      setCaption(<>Removed the {KIND_NAME[existing.kind]} on line {lineNo(target)}.</>, { quiet: true });
      return;
    }
    const text = tool === 'cond' ? condText : tool === 'log' ? logText : '';
    setBreakpoints([...breakpoints, { line: target, kind: tool, text }]);
    setCaption(
      <>
        Added a {KIND_NAME[tool]} on line {lineNo(target)}
        {target !== line && <> (line {lineNo(line)} has nothing to pause on, so it moved down, as DevTools does)</>}
        {tool === 'cond' && <>: it only pauses when <code>{text}</code> is true</>}
        {tool === 'log' && <>: it prints <code>{text}</code> each time and never pauses</>}.
      </>,
      { quiet: true },
    );
  };

  const markBug = () => {
    if (!pause) return;
    const onBug = pause.stack.some((f) => f.line === L.bug);
    if (onBug) {
      setFound(presses);
      setCaption(
        <>
          <span className="hl ok">Found it</span> in {plural(presses, 'press', 'presses')}: line {lineNo(L.bug)} applies the discount a second
          time, so 81 becomes 72.9. Pressing only Step into from the start takes {BRUTE_FORCE}.
        </>,
      );
    } else {
      const total = pause.stack.map((f) => f.locals.total).find((t) => t !== undefined);
      setCaption(
        <>
          Not this line: {total === undefined ? 'there is no total yet' : <>total is {preview(total)} here</>}. Watch total change as you step;
          the bug is where it stops being right.
        </>,
      );
    }
  };

  const runPrompt = () => {
    const src = prompt.trim();
    if (!src) return;
    const s = scope ?? (at === null ? [TRACE.pauses.at(-1)!.script, { result: TRACE.result }] : []);
    const r = evaluate(src, s);
    setEntries((e) => [...e, { text: `> ${src}`, kind: 'in' }, r.ok ? { text: preview(r.value), kind: 'result' } : { text: r.error, kind: 'error' }]);
    setPrompt('');
  };

  const stateOf = (i: number): LineState => {
    if (frame && i === frame.line) return 'now';
    if (!PAUSABLE.has(i)) return 'idle';
    return ran.has(i) && at !== NOT_STARTED ? 'past' : 'pending';
  };

  const inline = (i: number): ReactNode => {
    const bp = bpAt.get(i);
    const note = bp && bp.kind !== 'break' ? <span className={`dbg-bp-note is-${bp.kind}`}>{bp.kind === 'cond' ? `if ${bp.text}` : `log ${bp.text}`}</span> : null;
    let values: ReactNode = null;
    if (frame && scope && fnOfLine(i) === frame.fn && ran.has(i)) {
      const shown = (INLINE_VARS[i] ?? []).flatMap((name) => {
        const r = evaluate(name, scope);
        return r.ok && r.value !== undefined ? [`${name} = ${preview(r.value)}`] : [];
      });
      if (shown.length) values = <span className="dbg-inline">{shown.join(', ')}</span>;
    }
    return note || values ? <>{values}{note}</> : null;
  };

  const sections: ScopeSection[] =
    pause && frame
      ? [
          ...(frame.block ? [{ title: 'Block', hint: 'the for loop', vars: frame.block }] : []),
          ...(frame.fn !== '(anonymous)' ? [{ title: 'Local', hint: `${frame.fn}()`, vars: frame.locals }] : []),
          { title: 'Script', hint: 'top-level const', vars: pause.script },
        ]
      : [];

  const status = at === NOT_STARTED ? 'Not started' : at === null ? 'Finished' : `Paused, line ${lineNo(pause!.line)}`;

  return (
    <StageFrame
      minWidth={0}
      stats={
        <Stats>
          <Stat label="Status" value={status} color={paused ? 'var(--hi)' : undefined} />
          <Stat label="Presses" value={presses} sub={found !== null ? `found the bug in ${found}` : 'since the last restart'} color={found !== null ? 'var(--ok)' : undefined} />
          <Stat label="Step into only" value={BRUTE_FORCE} sub={`presses to reach line ${lineNo(L.bug)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'paused here' },
            { color: 'var(--bad)', label: 'breakpoint' },
            { color: 'var(--orange)', label: 'conditional' },
            { color: 'var(--violet)', label: 'logpoint' },
            { color: 'var(--info)', label: 'selected frame' },
            { color: 'var(--ok)', label: 'just changed' },
            { color: 'var(--dim)', label: 'not run yet' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="dbg-buttons" role="group" aria-label="Debugger controls">
            {CONTROLS.map((c) => (
              <Button key={c.action} variant={c.action === 'resume' ? 'primary' : 'ghost'} title={c.title} onClick={() => act(c.action)} disabled={at === null}>
                {c.label}
              </Button>
            ))}
            <Button title="Restart: run again from the top" onClick={restart}>⟲ Restart</Button>
          </div>
        </>,
        <>
          <Segmented label="Clicking a line adds a" options={TOOLS} value={tool} onChange={setTool} />
          {tool === 'cond' && <TextField label="Condition" value={condText} onChange={setCondText} width={150} spellCheck={false} />}
          {tool === 'log' && <TextField label="Log message" value={logText} onChange={setLogText} width={180} spellCheck={false} />}
          <Button onClick={() => setBreakpoints([])} disabled={breakpoints.length === 0}>Clear breakpoints</Button>
        </>,
      ]}
    >
      <div className="stage-pad dbg">
        <Hint block className="dbg-honest">Simulated debugger over a fixed program; the controls and panels mirror Chrome DevTools and VS Code.</Hint>
        <div className="dbg-grid">
          <Box className="dbg-source">
            <SectionTitle hint="click a line number for a breakpoint">checkout.js</SectionTitle>
            <CodePanel
              lines={SOURCE}
              stateOf={stateOf}
              nowStyle="bar"
              marker={(i) => (PAUSABLE.has(i) ? <BreakpointDot kind={bpAt.get(i)?.kind ?? null} /> : null)}
              trailing={inline}
              onLineClick={toggle}
              pressed={(i) => bpAt.has(i)}
              lineLabel={(i) => `Line ${lineNo(i)}: ${bpAt.has(i) ? `remove ${KIND_NAME[bpAt.get(i)!.kind]}` : PAUSABLE.has(i) ? `add ${KIND_NAME[tool]}` : `no code here; adds a ${KIND_NAME[tool]} on the next line that has some`}`}
            />
            <div className="dbg-mission">
              <span>
                <b>Mission:</b> pause on the line that makes the total wrong, then press the button. Fewer presses is better.
              </span>
              <Button variant={found !== null ? 'ghost' : 'primary'} onClick={markBug} disabled={!paused}>
                {found !== null ? '✓ Found' : 'This line is the bug'}
              </Button>
            </div>
          </Box>
          <div className="dbg-side">
            <CallStackPanel
              frames={(pause?.stack ?? []).map((f, k) => ({
                id: f.id,
                name: `${f.fn}${f.fn === '(anonymous)' ? '' : '()'}`,
                detail: `line ${lineNo(f.line)}`,
                state: k === 0 ? 'running' : 'idle',
              }))}
              anchor="top"
              showDepth={false}
              minHeight={0}
              meta={pause ? plural(pause.stack.length, 'frame') : undefined}
              selected={frame?.id}
              onSelect={(id) => {
                setSelectedId(id === pause?.stack[0].id ? null : Number(id));
                const f = pause?.stack.find((x) => x.id === id);
                if (f && f !== pause?.stack[0]) {
                  setCaption(<>Looking at <b>{f.fn}</b>'s frame: its variables, and line {lineNo(f.line)}, the call it's waiting on. Execution hasn't moved.</>, { quiet: true });
                }
              }}
              empty={<p className="empty-note">{at === null ? 'Program finished.' : 'Not running.'}</p>}
              className="dbg-stack"
            />
            <ScopePane sections={sections} changed={changed} flashKey={presses} />
            <WatchPane watches={watches} setWatches={setWatches} scope={scope} />
          </div>
        </div>
        <div className="dbg-console">
          <ConsolePanel lines={entries.map(toConsoleLine)} empty="console.log output, logpoints and your expressions appear here" />
          <TextField
            ariaLabel="Console: evaluate an expression in the selected frame"
            value={prompt}
            onChange={setPrompt}
            onEnter={runPrompt}
            placeholder={paused ? '> evaluate in the selected frame, e.g. items[i]' : '> evaluate an expression'}
            spellCheck={false}
            className="dbg-prompt"
          />
        </div>
      </div>
    </StageFrame>
  );
}

const KIND_NAME: Record<BreakpointKind, string> = { break: 'breakpoint', cond: 'conditional breakpoint', log: 'logpoint' };

function toConsoleLine(e: ConsoleEntry): ConsoleLine {
  if (e.kind === 'out') return e.text;
  if (e.kind === 'log') return { text: `◆ ${e.text}`, tone: 'violet' };
  if (e.kind === 'in') return { text: e.text, tone: 'dim' };
  if (e.kind === 'error') return { text: e.text, tone: 'bad' };
  return { text: `← ${e.text}`, tone: 'info' };
}

/** The caption after a control: what ran, why it stopped where it did. */
function describe(action: Action, from: number, m: Move): ReactNode {
  const logs = m.printed.filter((e) => e.kind === 'log').length;
  const logNote = logs > 0 && <> The logpoint printed {plural(logs, 'line')} on the way, without pausing.</>;
  const errNote = m.conditionErrors.length > 0 && <> A condition failed ({m.conditionErrors[0]}), so it was treated as false.</>;
  if (m.to === null) {
    return <>The program ran to the end and printed <span className="hl bad">{TRACE.output.join(' ')}</span>.{logNote}{errNote} Press Restart to go again.</>;
  }
  const p = TRACE.pauses[m.to];
  const where = <>line {lineNo(p.line)} in <b>{p.stack[0].fn}</b></>;
  if (m.hit) {
    const why = m.hit.kind === 'cond' ? <>: <code>{m.hit.text}</code> is true here</> : null;
    const via = action === 'resume' ? '' : ` (a breakpoint inside the code you ${action === 'out' ? 'stepped out through' : 'stepped over'} still pauses)`;
    return <>Paused at the {KIND_NAME[m.hit.kind]} on {where}{why}{via}.{logNote}{errNote}</>;
  }
  const prev = from >= 0 ? TRACE.pauses[from] : null;
  if (action === 'into' && prev && p.stack.length > prev.stack.length) {
    return <>Step into went inside <b>{p.stack[0].fn}()</b>: a new frame on the call stack, paused on its first line.</>;
  }
  if (action === 'over' && m.ranThrough > 0) {
    const callee = TRACE.pauses[from + 1].stack[0].fn;
    return <>Step over <b>ran</b> {callee}() completely ({plural(m.ranThrough, 'line')} inside it) without stopping, and paused on {where}.{logNote}{errNote}</>;
  }
  if (action === 'out' || (prev && p.stack.length < prev.stack.length)) {
    return <>{prev?.stack[0].fn}() returned; back in <b>{p.stack[0].fn}</b>, paused on line {lineNo(p.line)}, the line after the call.{logNote}{errNote}</>;
  }
  return <>Paused on {where}.{logNote}{errNote}</>;
}
