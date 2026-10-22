import { useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { VISIT_DEFINITION, counterCaption, counterNumbers, num } from './captions';
import { BUDGET, backtrackVisits, letters, nfaVisits } from './engines';
import { COUNTER_MAX, COUNTER_MIN, COUNTER_PATTERN, initialCounter } from './opening';
import { anchored } from './patterns';
import { splitTree } from './splitTree';

const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 220;
const TREE_WIDTH = 356;
const TREE_HEIGHT = 200;
const TREE_RADIUS = 4;
/** The plot's top: a little above the budget so the budget line is not on the frame. */
const PLOT_TOP = BUDGET * 3;

/** Scene 1: the step counter on the textbook nested repeat, beside a linear-time engine. */
export function CounterScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCounter);
  const n = state.letters;
  const { bt, nfa } = counterNumbers(n);
  const [series] = useState(() =>
    Array.from({ length: COUNTER_MAX }, (_, i) => {
      const k = i + COUNTER_MIN;
      return { n: k, bt: backtrackVisits(COUNTER_PATTERN, letters(k)), nfa: nfaVisits(COUNTER_PATTERN, letters(k)).visits };
    }),
  );
  const tree = splitTree(n);
  const children = new Map<number, number[]>();
  for (const node of tree.nodes) if (node.parent !== null) children.set(node.parent, [...(children.get(node.parent) ?? []), node.id]);
  const subject = letters(n);
  const verdict = bt.gaveUp ? { text: 'gave up at the step budget', tone: 'orange' as const } : { text: 'no match', tone: 'muted' as const };

  return (
    <StageFrame
      height={430}
      intro={counterCaption(n)}
      introKey={[n]}
      stats={
        <Stats>
          <Stat label="Backtracking" value={bt.gaveUp ? 'gave up' : num(bt.visits)} color={bt.gaveUp ? 'var(--orange)' : 'var(--bad)'} sub={bt.gaveUp ? `at the step budget of ${num(BUDGET)} visits` : 'visits'} />
          <Stat label="Linear-time engine" value={num(nfa.visits)} color="var(--ok)" sub="visits (NFA simulation)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'backtracking visits (the costly side)', shape: 'line' },
            { color: 'var(--ok)', label: 'linear-time engine visits', shape: 'line' },
            { color: 'var(--orange)', label: 'the step budget', shape: 'line' },
            { color: 'var(--info)', label: 'ways to cut the letters', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Letters before the !" value={n} min={COUNTER_MIN} max={COUNTER_MAX} onChange={(v) => setState({ letters: v })} />
        </>,
      ]}
    >
      <div className="rd-stage stage-pad">
        <div className="rd-block">
          <SectionTitle>The text</SectionTitle>
          <ArrayStrip values={subject} cellMax={28} cellState={(i) => (i === n ? 'active' : 'idle')} />
        </div>
        <ConsolePanel
          title="the pattern, the text, the verdict"
          lines={[
            `pattern ${anchored(COUNTER_PATTERN)}`,
            `text ${plural(n, 'letter')} then !`,
            { text: `backtracking: ${verdict.text}`, tone: verdict.tone },
          ]}
        />
        <p className="rd-note">{VISIT_DEFINITION}</p>
        <div className="rd-two">
          <div className="rd-block">
            <SectionTitle>Visits against letters (log scale)</SectionTitle>
            <Plot2D
              x={{ domain: [COUNTER_MIN, COUNTER_MAX], label: 'letters before the !' }}
              y={{ domain: [1, PLOT_TOP], log: true, ticks: 6, label: 'visits' }}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
              ariaLabel={`Visits against letters: backtracking reaches the budget of ${num(BUDGET)} while the linear-time engine reaches ${num(series[series.length - 1].nfa)}`}
            >
              <HLine at={BUDGET} label="budget" tone="orange" />
              <Curve points={series.map((p) => [p.n, p.bt.visits] as const)} tone="bad" />
              <Curve points={series.map((p) => [p.n, p.nfa] as const)} tone="ok" />
              <Points data={series.filter((p) => p.bt.gaveUp).map((p) => ({ x: p.n, y: BUDGET, tone: 'orange' as const }))} />
              <Points data={[{ x: n, y: Math.max(1, bt.visits), tone: 'bad' as const }, { x: n, y: nfa.visits, tone: 'ok' as const }]} />
            </Plot2D>
          </div>
          <div className="rd-block">
            <SectionTitle hint={`${num(tree.cuts)} complete cuts in all`}>Ways the outer + can cut the letters</SectionTitle>
            <TreeSvg
              shape={{ root: 0, children: (id: number) => children.get(id) ?? [] }}
              width={TREE_WIDTH}
              height={TREE_HEIGHT}
              radius={TREE_RADIUS}
              label={() => ''}
              natural
              nodeMark={() => ({ tone: 'info', fill: 'solid' })}
              ariaLabel={`Tree of the ways to cut ${plural(n, 'letter')}: ${tree.nodes.length} of ${num(tree.total)} nodes drawn`}
            />
            <p className="rd-note">
              {tree.nodes.length < tree.total ? `${num(tree.total - tree.nodes.length)} more nodes not drawn (the drawing stops at ${tree.nodes.length}).` : `All ${num(tree.total)} nodes drawn.`} Computed by enumeration, not a replay of the matcher.
            </p>
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">no real regex engine or service is involved: a lesson-authored matcher counts its own steps</Provenance>
        <Provenance kind="toy">a small matcher with literals, groups, alternation, + and *; real engines add optimisations and sometimes memoisation</Provenance>
        <Provenance kind="from-memory">backtracking regexes have caused real production outages; the best-known public postmortem is from a CDN provider in 2019: read the provider's own postmortem before relying on this</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
