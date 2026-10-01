import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { randInt } from '../../core/random';
import { MethodRail } from './MethodRail';
import {
  ALL_SUSPECTS, BUGS, COMPONENTS, EXPECTED, INPUT, midProbe, narrow, OTHER_INPUT, optimalProbes, probe, runPipeline, showValue,
  type Suspects,
} from './model';
import { trapRows } from './trap';

const N = COMPONENTS.length;
const OPTIMAL = optimalProbes(N);
const NODE_W = 92;
const NODE_H = 50;
const STEP_X = 132;
const FIRST_X = 56;
const SVG_W = FIRST_X * 2 + (COMPONENTS.length - 1) * STEP_X;
const SVG_H = 190;
const ROW_Y = 92;
/** The drawing stays readable (≥ 8px text) down to this width; narrower screens scroll it. */
const MIN_SVG_WIDTH = 820;

interface Probe {
  after: number;
  ok: boolean;
  text: string;
  /** It was placed outside the suspects, so it taught nothing new. */
  wasted: boolean;
}

const nodeX = (i: number) => FIRST_X + i * STEP_X;
const gapX = (i: number) => nodeX(i) + STEP_X / 2;
const newFault = (avoid?: number) => {
  let f = randInt(0, N - 1);
  while (f === avoid) f = randInt(0, N - 1);
  return f;
};

export function PipelineScene({ picker }: { picker: ReactNode }) {
  const [fault, setFault] = useState(() => newFault());
  const [probes, setProbes] = useState<Probe[]>([]);
  const [suspects, setSuspects] = useState<Suspects>(ALL_SUSPECTS);
  const [fixed, setFixed] = useState(false);
  const [regression, setRegression] = useState(false);
  const [trap, setTrap] = useState(false);
  const setCaption = useSetCaption();
  const output = runPipeline(fixed ? null : fault).at(-1)!.text;
  useIntroCaption(
    <>
      The order <code>{INPUT}</code> should cost <span className="hl ok">{EXPECTED}</span> but comes out as{' '}
      <span className="hl bad">{runPipeline(fault).at(-1)!.text}</span>. One of eight components is wrong. Click a gap to probe the value
      there.
    </>,
  );

  const found = suspects.lo === suspects.hi;
  const used = probes.length;
  const railDone = regression ? 6 : fixed ? 5 : found ? 4 : suspects.hi - suspects.lo <= 1 ? 3 : used > 0 ? 2 : 1;

  const place = (after: number) => {
    if (found || probes.some((p) => p.after === after)) return;
    const { value, ok } = probe(fault, after);
    const wasted = after < suspects.lo || after >= suspects.hi;
    const next = narrow(suspects, after, ok);
    setProbes((ps) => [...ps, { after, ok, text: showValue(value, after), wasted }]);
    setSuspects(next);
    const name = COMPONENTS[after];
    if (next.lo === next.hi) {
      const c = COMPONENTS[next.lo];
      setCaption(
        <>
          Found it: the value goes into <b>{c}</b> right and comes out wrong. {used + 1} probes; bisection never needs more than{' '}
          {OPTIMAL}. Now fix it.
        </>,
      );
    } else if (wasted) {
      setCaption(<>You already knew that: the gap after {name} is outside the suspects. That probe taught nothing.</>);
    } else {
      setCaption(
        ok ? (
          <>After {name}: <span className="hl ok">{showValue(value, after)}</span>, right. The bug is somewhere after it.</>
        ) : (
          <>After {name}: <span className="hl bad">{showValue(value, after)}</span>, wrong. The bug is at or before {name}.</>
        ),
      );
    }
  };

  const fix = () => {
    setFixed(true);
    setCaption(<>The bug: <b>{BUGS[COMPONENTS[fault]].what}</b>. Fixed: the output is now {EXPECTED}. Don't stop here: add a test.</>);
  };
  const addTest = () => {
    setRegression(true);
    setCaption(<>A regression test now pins {INPUT} → {EXPECTED}. If anyone reintroduces this bug, CI fails before users see it.</>);
  };
  const reset = () => {
    setFault((f) => newFault(f));
    setProbes([]);
    setSuspects(ALL_SUSPECTS);
    setFixed(false);
    setRegression(false);
    setCaption(<>A new bug is hiding in a different component. Start probing.</>);
  };

  const probeKey = (e: KeyboardEvent, after: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      place(after);
    }
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="probes" value={used} color={used > OPTIMAL ? 'var(--bad)' : 'var(--hi)'} sub={`bisection needs at most ${OPTIMAL}`} />
          <Stat label="suspects" value={suspects.hi - suspects.lo + 1} sub={`of ${N} components`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'suspect range' },
            { color: 'var(--ok)', label: 'probe: right value' },
            { color: 'var(--bad)', label: 'wrong value / the bug' },
            { color: 'var(--dim)', label: 'ruled out' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => place(midProbe(suspects))} disabled={found}>
            Bisect for me
          </Button>
          <Button onClick={fix} disabled={!found || fixed}>
            Fix it
          </Button>
          <Button onClick={addTest} disabled={!fixed || regression}>
            Add a regression test
          </Button>
          <Button onClick={reset}>New hidden bug</Button>
        </>,
        <Toggle key="trap" label="Trap: change two things at once" value={trap} onChange={setTrap} off="Hide" on="Show" />,
      ]}
    >
      <div className="dm stage-pad">
        <MethodRail done={railDone} />
        <WideRegion minWidth={MIN_SVG_WIDTH} label="Pipeline: scroll sideways to see every component">
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="dm-svg" role="group" aria-label="Order pipeline">
            <text x={nodeX(0) - NODE_W / 2} y={24} className="dm-io is-ok">
              in: {INPUT} ✓
            </text>
            <text x={nodeX(N - 1) + NODE_W / 2} y={24} textAnchor="end" className={`dm-io ${output === EXPECTED ? 'is-ok' : 'is-bad'}`}>
              out: {output} {output === EXPECTED ? '✓' : `✗ (expected ${EXPECTED})`}
            </text>
            {COMPONENTS.map((c, i) => {
              const out = i < suspects.lo || i > suspects.hi;
              const culprit = found && i === suspects.lo;
              return (
                <SceneNode
                  key={c}
                  at={{ x: nodeX(i), y: ROW_Y }}
                  w={NODE_W}
                  h={NODE_H}
                  title={c}
                  sub={culprit ? (fixed ? 'fixed' : 'the bug') : undefined}
                  tone={culprit && fixed ? 'ok' : 'hi'}
                  on={!out && (!found || fixed)}
                  variant={culprit && !fixed ? 'bad' : out ? 'dim' : 'default'}
                />
              );
            })}
            {COMPONENTS.slice(0, -1).map((c, i) => {
              const p = probes.find((x) => x.after === i);
              return (
                <g
                  key={c}
                  className={`dm-probe ${p ? (p.ok ? 'is-ok' : 'is-bad') : ''} ${p?.wasted ? 'is-wasted' : ''} ${p && fixed ? 'is-stale' : ''}`}
                  role="button"
                  tabIndex={found || p ? -1 : 0}
                  aria-label={
                    p ? `Probe after ${c}: ${p.text}, ${p.ok ? 'right' : 'wrong'}${fixed ? ', taken before the fix' : ''}` : `Probe the value after ${c}`
                  }
                  onClick={() => place(i)}
                  onKeyDown={(e) => probeKey(e, i)}
                >
                  <circle cx={gapX(i)} cy={ROW_Y} r={11} />
                  <text x={gapX(i)} y={ROW_Y + 4} textAnchor="middle" className="dm-probe-mark">
                    {p ? (p.ok ? '✓' : '✗') : '+'}
                  </text>
                  {p && (
                    <text x={gapX(i)} y={ROW_Y + 56} textAnchor="middle" className="dm-probe-value">
                      {p.text}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </WideRegion>
        {trap && <TrapTable />}
        <p className="dm-note">A scripted pipeline with one planted bug; a real probe is a log line, a breakpoint or a test.</p>
      </div>
    </StageFrame>
  );
}

function TrapTable() {
  const rows = trapRows();
  const mark = (ok: boolean, text: string) => <span className={ok ? 'dm-ok' : 'dm-bad'}>{text} {ok ? '✓' : '✗'}</span>;
  return (
    <Box variant="sunken" className="dm-trap">
      <SectionTitle hint="bug: discount applied twice">Change two things at once</SectionTitle>
      <table className="data-table">
        <thead>
          <tr>
            <th>Fix the discount</th>
            <th>Also switch round() to floor()</th>
            <th>{INPUT}</th>
            <th>{OTHER_INPUT}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.fix}-${r.extra}`} className={r.fix && r.extra ? 'dm-trap-both' : ''}>
              <td>{r.fix ? 'yes' : 'no'}</td>
              <td>{r.extra ? 'yes' : 'no'}</td>
              <td>{mark(r.mainOk, r.main)}</td>
              <td>{mark(r.otherOk, r.other)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dm-note">
        Ship both changes and the failing order is fixed, so you'd think you are done. But you can't tell which change fixed it, and the
        floor() change quietly breaks {OTHER_INPUT}. Change one thing, then test.
      </p>
    </Box>
  );
}
