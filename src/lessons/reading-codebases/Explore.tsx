import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { FileTree } from './FileTree';
import { apply, lineText, solved, START, type NavState, type Step, type Task } from './model';
import { Tools } from './Tools';
import { Viewer } from './Viewer';

const REPLAY_STEP_MS = 1400;

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** What a step did, as a caption. */
function describe(step: Step, s: NavState): ReactNode {
  switch (step.tool) {
    case 'open':
      return step.at.line > 0
        ? <>Reading <span className="hl">{nameOf(step.at.file)}:{step.at.line}</span>: <code>{lineText(step.at).trim()}</code></>
        : <>Opened <span className="hl">{step.at.file}</span>. Click a line to select it.</>;
    case 'search':
      return <>Search for <span className="hl info">{step.query}</span>: {plural(s.search!.hits.length, 'match', 'matches')}. Click one to open it.</>;
    case 'definition':
      return <>Go to definition: <span className="hl violet">{step.symbol}</span> is declared in {nameOf(s.at!.file)}, line {s.at!.line}.</>;
    case 'references':
      return <>Find references: {plural(s.refs!.hits.length, 'line')} of code use <span className="hl violet">{step.symbol}</span>.</>;
    case 'blame': {
      const c = s.blamed!.commit;
      return <>Blame: commit <b>{c.hash}</b> by {c.author} on {c.date}: <i>"{c.message}"</i></>;
    }
  }
}

/** One task: the tree, the viewer and the tools, driving the pure navigator. */
export function Explore({ task, picker, onRestart }: { task: Task; picker: ReactNode; onRestart: () => void }) {
  const setCaption = useSetCaption();
  const [nav, setNav] = useState<NavState>(START);
  const [replaying, setReplaying] = useState(false);
  const timers = useRef<number[]>([]);
  const done = solved(task, nav);

  useIntroCaption(<>Your task: <b>{task.question}</b> Use the tools: <b>search</b>, <b>go to definition</b>, <b>find references</b> and <b>blame</b>.</>);

  const stopReplay = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setReplaying(false);
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const found = (steps: number) => (
    <><span className="hl ok">Found it.</span> {task.explain} {plural(steps, 'step')}
      {steps < task.solution.length ? `: quicker than the replay's ${task.solution.length}, nice.` : steps > task.solution.length ? `; the replay takes ${task.solution.length}.` : '.'}</>
  );

  const act = (step: Step) => {
    if (replaying) stopReplay();
    const next = apply(nav, step);
    if (next === nav) return;
    setNav(next);
    const near = step.tool === 'open' ? task.near?.find((n) => n.at.file === step.at.file && n.at.line === step.at.line) : undefined;
    if (solved(task, next)) setCaption(found(next.steps));
    else if (near) setCaption(<>{describe(step, next)} <span className="hl">{near.nudge}</span></>);
    else setCaption(describe(step, next));
  };

  const replay = () => {
    stopReplay();
    setReplaying(true);
    setNav(START);
    setCaption(<>The efficient path for: <b>{task.question}</b></>);
    let s = START;
    timers.current = task.solution.map((step, i) =>
      window.setTimeout(() => {
        s = apply(s, step);
        setNav(s);
        setCaption(solved(task, s) ? <><span className="hl ok">Found it</span> in {plural(s.steps, 'step')}. {task.explain}</> : describe(step, s));
        if (i === task.solution.length - 1) setReplaying(false);
      }, REPLAY_STEP_MS * (i + 1)),
    );
  };

  return (
    <StageFrame
      height={600}
      stats={
        <Stats>
          <Stat label="Task" value={task.question} className="rc-task" color={done ? 'var(--ok)' : 'var(--text)'}
            sub={done ? 'answered' : task.needs === 'blame' ? 'find the line, then blame it' : 'find the line and select it'} />
          <Stat label="Steps" value={nav.steps} color="var(--info)" sub={`the replay takes ${task.solution.length}`} />
          <Stat label="Files visited" value={nav.trail.length} color="var(--violet)" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button onClick={replay} disabled={replaying}>Show the efficient path</Button>
          <Button onClick={onRestart} disabled={nav.steps === 0 && !replaying}>Start over</Button>
        </>,
        <Hint key="tip" block>
          Fictional repo. Start from an entry point (a route) or a failing test, and read tests as documentation. Reading every file top to bottom is the slow way.
        </Hint>,
      ]}
    >
      <div className="rc-stage">
        <FileTree nav={nav} task={task} done={done} onOpen={(file) => act({ tool: 'open', at: { file, line: 0 } })} />
        <Viewer nav={nav} task={task} done={done} onLine={(at) => act({ tool: 'open', at })} />
        <Tools nav={nav} onAct={act} onOpenHit={(h) => act({ tool: 'open', at: { file: h.file, line: h.line } })} />
      </div>
    </StageFrame>
  );
}
