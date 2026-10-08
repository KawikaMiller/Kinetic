import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { MAILER_CLASS, ORDER_SERVICE, REPO_CLASS, mainLines, type MailerChoice, type RepoChoice } from './programs';
import { runRoot } from './run';
import { BOX, GRAPH_MIN_WIDTH, GRAPH_WIDTH, type DiEdge } from './shared';

const H = 330;
const AT: Record<string, { x: number; y: number }> = {
  main: { x: 100, y: 80 },
  OrderService: { x: 100, y: 250 },
  PostgresRepo: { x: 440, y: 40 },
  InMemoryRepo: { x: 440, y: 125 },
  SmtpMailer: { x: 440, y: 210 },
  ConsoleMailer: { x: 440, y: 295 },
};
const NODES = Object.keys(AT);
const CONCRETE = [...Object.values(REPO_CLASS), ...Object.values(MAILER_CLASS)];

/** Lines that differ between two versions of a file. */
const linesChanged = (a: readonly string[], b: readonly string[]) => Math.max(a.length, b.length) - a.filter((l, i) => l === b[i]).length;

export function RootScene({ picker }: { picker: ReactNode }) {
  const [repo, setRepo] = useState<RepoChoice>('postgres');
  const [mailer, setMailer] = useState<MailerChoice>('smtp');
  const [last, setLast] = useState<{ main: number; moved: string | null }>({ main: 0, moved: null });
  const setCaption = useSetCaption();
  useIntroCaption('main() is the composition root: the one place that picks concrete classes. Swap the repo or the mailer and watch what changes.');

  const out = runRoot(repo, mailer);
  const concreteInService = CONCRETE.filter((c) => ORDER_SERVICE.injected.some((l) => l.split(/\W+/).includes(c))).length;
  const ok = out.passed.every(Boolean);
  const chosen = new Set([REPO_CLASS[repo], MAILER_CLASS[mailer]]);

  const swap = (nextRepo: RepoChoice, nextMailer: MailerChoice) => {
    const before = mainLines(repo, mailer);
    const after = mainLines(nextRepo, nextMailer);
    const moved = nextRepo !== repo ? REPO_CLASS[nextRepo] : nextMailer !== mailer ? MAILER_CLASS[nextMailer] : null;
    setRepo(nextRepo);
    setMailer(nextMailer);
    setLast({ main: linesChanged(before, after), moved });
    const run = runRoot(nextRepo, nextMailer);
    setCaption(
      `main() now builds ${REPO_CLASS[nextRepo]} and ${MAILER_CLASS[nextMailer]}: ${linesChanged(before, after)} line of main changed, 0 of OrderService. ${
        run.passed.every(Boolean) ? 'The order goes through.' : 'The run fails on the simulated network.'
      }`,
    );
  };

  const edges: DiEdge[] = [
    { from: 'main', to: 'OrderService', kind: 'plain' },
    { from: 'main', to: REPO_CLASS[repo], kind: 'plain' },
    { from: 'main', to: MAILER_CLASS[mailer], kind: 'plain' },
    { from: 'OrderService', to: REPO_CLASS[repo], kind: 'injected' },
    { from: 'OrderService', to: MAILER_CLASS[mailer], kind: 'injected' },
  ];
  const nodeMark = (id: string): GraphNodeMark | null => {
    if (id === last.moved) return { tone: 'hi', fill: 'solid' };
    if (id === 'main' || id === 'OrderService' || chosen.has(id)) return null;
    return { tone: 'dim', fill: 'tint' };
  };
  const edgeMark = (_e: unknown, i: number): GraphEdgeMark | null => {
    const e = edges[i];
    if (e.kind === 'injected') return { tone: e.to === last.moved ? 'hi' : 'info', width: 3 };
    return null;
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Run" value={ok ? 'order placed' : 'failed'} color={ok ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Lines changed in main.js" value={last.main} sub="by your last switch" />
          <Stat label="Concrete classes OrderService names" value={concreteInService} color={concreteInService ? 'var(--bad)' : 'var(--ok)'} sub="so no switch here can edit it" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--line-2)', label: 'main() creates', shape: 'line' },
            { color: 'var(--info)', label: 'injected into OrderService', shape: 'line' },
            { color: 'var(--hi)', label: 're-pointed by your last switch', shape: 'square' },
            { color: 'var(--dim)', label: 'not chosen', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented
            label="Repository"
            value={repo}
            onChange={(r) => swap(r, mailer)}
            options={[
              { value: 'postgres', label: 'Postgres' },
              { value: 'memory', label: 'In-memory' },
            ]}
          />
          <Segmented
            label="Mailer"
            value={mailer}
            onChange={(m) => swap(repo, m)}
            options={[
              { value: 'smtp', label: 'SMTP' },
              { value: 'console', label: 'Console' },
            ]}
          />
        </>,
      ]}
    >
      <div className="di stage-pad">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Object graph: scroll sideways to see all of it">
          <GraphView
            nodes={NODES.map((id) => ({ id, at: AT[id], shape: 'box' as const, label: id === 'main' ? 'main()' : id }))}
            edges={edges}
            directed
            width={GRAPH_WIDTH}
            height={H}
            box={BOX}
            arrowSize={6}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            className="di-graph"
            ariaLabel={`main creates OrderService, ${REPO_CLASS[repo]} and ${MAILER_CLASS[mailer]}, and passes the last two into OrderService`}
          />
        </WideRegion>
        <div className="di-code">
          <CodePanel title="main.js" lines={mainLines(repo, mailer).slice(0, 5)} stateOf={(i) => (last.moved && (i === 1 || i === 2) && mainLines(repo, mailer)[i].includes(last.moved) ? 'now' : 'idle')} />
          <div className="di-col">
            <CodePanel title="OrderService.js (never edited)" lines={ORDER_SERVICE.injected} />
            <ConsolePanel title="output of main().place(…)" lines={out.lines} />
          </div>
        </div>
        <Hint block>
          No framework here: main() is plain code, and that is all dependency injection needs. PostgresRepo and SmtpMailer are simulated and always refuse
          the connection; the run is real JavaScript.
        </Hint>
      </div>
    </StageFrame>
  );
}
