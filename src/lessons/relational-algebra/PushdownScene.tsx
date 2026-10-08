import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { toneVar } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { ExprTree } from './ExprTree';
import { pushdownFrames, type PushFrame } from './frames';
import { REWRITES, TEACHERS, evaluate, intermediateRows, postOrder, pushedPlan, resultOf, sameRows, unpushedPlan, type Expr, type Rewrite } from './model';

const STEP_MS = 1800;
/** The comparison is about plan shape, so it runs with set semantics (the algebra's). */
const MODE = 'set' as const;

export function PushdownScene({ picker }: { picker: ReactNode }) {
  const [teacher, setTeacher] = useState(TEACHERS[0]);
  const [rewrite, setRewrite] = useState<Rewrite>('sigma');
  const unpushed = useMemo(() => unpushedPlan(teacher), [teacher]);
  const pushed = useMemo(() => pushedPlan(teacher, rewrite), [teacher, rewrite]);
  const frames = useMemo(() => pushdownFrames(unpushed, pushed, MODE, rewrite), [unpushed, pushed, rewrite]);
  const player = usePlayer<PushFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const k = player.frame.steps;
  const finished = player.index === frames.length - 1;
  const iu = intermediateRows(unpushed, MODE);
  const ip = intermediateRows(pushed, MODE);
  const ru = resultOf(unpushed, MODE);
  const rp = resultOf(pushed, MODE);
  const same = ru.ok && rp.ok && sameRows(ru.out, rp.out);
  const cheaper = (mine: number, other: number) => (mine < other ? toneVar('ok') : mine > other ? toneVar('bad') : undefined);

  return (
    <StageFrame
      player={player}
      height={480}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'operator running / row counts' },
        { color: 'var(--bad)', label: 'more intermediate rows' },
        { color: 'var(--ok)', label: 'fewer intermediate rows' },
      ]} />}
      stats={finished ? (
        <Stats>
          <Stat label="join first: intermediate rows" value={iu} color={cheaper(iu, ip)} />
          <Stat label="filter first: intermediate rows" value={ip} color={cheaper(ip, iu)} />
          <Stat label="results" value={same ? 'identical' : 'differ'} color={same ? undefined : toneVar('bad')} />
        </Stats>
      ) : undefined}
      controls={[
        <Fragment key="pick">{picker}<Segmented label="Teacher" value={teacher} onChange={setTeacher} options={TEACHERS.map((t) => ({ value: t, label: t }))} /></Fragment>,
        <Segmented key="rewrite" label="Right-hand plan" value={rewrite} onChange={setRewrite} options={REWRITES.map((r) => ({ value: r.id, label: r.label }))} />,
      ]}
    >
      <div className="stage-pad ra">
        <div className="ra-plans">
          <Plan title="Join first, filter last" label="Join first, filter last" plan={unpushed} steps={k} />
          <Plan
            title={rewrite === 'sigma' ? <>Filter first (<span className="keep-case">σ</span> pushed down)</> : 'Filter first, small side joined first'}
            label={rewrite === 'sigma' ? 'Filter first (σ pushed down)' : 'Filter first, small side joined first'}
            plan={pushed}
            steps={k}
          />
        </div>
        <Hint block>
          Moving σ below ⋈ is legal here because the condition only uses columns of Courses and the joins are inner (on the null-padded side of an outer join it
          would change the result), and it only helps because σ removes rows. Intermediate rows = every row an operator below the top π produced: the work a naive
          engine would do. Real optimisers estimate this from statistics and choose the plan themselves. Set semantics. Evaluated by the lesson's own engine; both plans' results are checked against SQLite in tests.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Plan({ title, label, plan, steps }: { title: ReactNode; label: string; plan: Expr; steps: number }) {
  const ev = useMemo(() => evaluate(plan, MODE), [plan]);
  const ops = postOrder(plan).filter((x) => x.op !== 'rel');
  const counted = new Set([...postOrder(plan).filter((x) => x.op === 'rel').map((x) => x.id), ...ops.slice(0, steps).map((x) => x.id)]);
  const current = steps > 0 && steps <= ops.length ? ops[steps - 1].id : null;
  return (
    <div className="ra-plan">
      <SectionTitle weight="regular">{title}</SectionTitle>
      <ExprTree expr={plan} ev={ev} current={current} counted={counted} label={label} />
    </div>
  );
}
