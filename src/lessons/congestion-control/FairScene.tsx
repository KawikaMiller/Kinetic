import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { fairnessIntro, seg } from './captions';
import { CAPACITY, PLANE, RULES, RULE_LABEL, readTrajectory, trajectory, type Rates } from './fairness';
import { DEFAULT_START, initialFairness, snapStart, type FairnessState } from './init';

const RULE_OPTIONS = RULES.map((r) => ({ value: r, label: RULE_LABEL[r] }));
const STARTS: { label: string; at: Rates }[] = [
  { label: 'unfair start (20, 60)', at: DEFAULT_START },
  { label: 'lopsided (10, 80)', at: [10, 80] },
  { label: 'both small (15, 15)', at: [15, 15] },
];

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the path the two rates take' },
      { color: 'var(--info)', label: 'the start: drag it, or focus it and use the arrow keys' },
      { color: 'var(--violet)', label: 'solid line: the link is exactly full (efficient); dashed line: both flows equal (fair)', shape: 'line' },
    ]}
  />
);

export function FairScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<FairnessState>(initialFairness);
  const path = useMemo(() => trajectory(st.start, st.rule), [st]);
  const read = readTrajectory(path);
  const end = path[path.length - 1];

  return (
    <StageFrame
      height={520}
      legend={LEGEND}
      intro={fairnessIntro(st.rule, read)}
      introKey={[st.rule, st.start[0], st.start[1]]}
      stats={
        <Stats>
          <Stat label="Gap between the flows" value={`${seg(read.startGap)} to ${seg(read.endGap)}`} sub="points of capacity, start to end" color={read.endGap < read.startGap / 4 ? 'var(--ok)' : undefined} />
          <Stat label="Link use, last 20 steps" value={`${seg(read.lowSum)}-${seg(read.highSum)}%`} sub="of capacity, lowest to highest" />
          <Stat label="End point" value={`${seg(end[0])}, ${seg(end[1])}`} sub="flow 1, flow 2" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Rule" value={st.rule} options={RULE_OPTIONS} onChange={(rule) => setSt((s) => ({ ...s, rule }))} />
        </>,
        <>
          <ControlGroup label="Start" inline>
            {STARTS.map((s) => (
              <ChipButton key={s.label} on={st.start[0] === s.at[0] && st.start[1] === s.at[1]} onClick={() => setSt((x) => ({ ...x, start: s.at }))}>
                {s.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setSt(initialFairness())}>Reset</Button>
        </>,
      ]}
    >
      <div className="cc-stage stage-pad">
        <Box>
          <SectionTitle hint="two flows, rates in percent of the link; each step both see the same signal">Chiu-Jain plot</SectionTitle>
          <Plot2D
            x={{ domain: [0, PLANE], label: 'flow 1, % of capacity', ticks: 6 }}
            y={{ domain: [0, PLANE], label: 'flow 2, % of capacity', ticks: 6 }}
            aspect="equal"
            ariaLabel={`Rates of two flows under ${RULE_LABEL[st.rule]}, from a start you can move, against the efficiency and fairness lines`}
          >
            <Segments segments={[{ from: [0, CAPACITY], to: [CAPACITY, 0] }]} tone="violet" />
            <Segments segments={[{ from: [0, 0], to: [PLANE, PLANE] }]} tone="violet" dashed />
            <Curve points={path} tone="hi" />
            <Points data={[{ x: end[0], y: end[1], tone: 'hi', hollow: true }]} />
            <Points
              data={[{ x: st.start[0], y: st.start[1], tone: 'info', r: 6 }]}
              onDrag={(_, p) => setSt((s) => ({ ...s, start: snapStart(p) }))}
              pointLabel={() => 'Start of the two flows'}
            />
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">rates computed step by step from the rule; capacity 100, add 2, subtract 5, multiply by 1.1, multiply down by 0.5 (illustrative)</Provenance>
          <Provenance kind="from-memory">the picture is the Chiu-Jain analysis; AIMD is what Reno and CUBIC do (verify)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
