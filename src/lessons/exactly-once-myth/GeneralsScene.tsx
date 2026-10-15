import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { generalsCaption } from './captions';
import { DEFAULT_DEPTH, DEFAULT_LOSS, DEPTH, GENERALS_SEED, LOSS_MAX, patternCounts, pBoth, pDisagree, pNobody, receiverOf, runSeeded, senderOf } from './generals';

const PLOT_W = { wide: 520, narrow: 356 } as const;
const LOSS_STEP = 0.05;
const KS = Array.from({ length: DEPTH.max }, (_, i) => i + 1);

export function GeneralsScene({ picker }: { picker: ReactNode }) {
  const [k, setK] = useState(DEFAULT_DEPTH);
  const [p, setP] = useState(DEFAULT_LOSS);
  const [seed, setSeed] = useState(GENERALS_SEED);
  const narrow = useMediaQuery(PHONE_QUERY);
  const run = runSeeded(k, p, seed);
  const counts = patternCounts(k);

  useIntroCaption(generalsCaption({ k, p, outcome: run.outcome, seed }), [k, p, seed]);

  const messages = run.messengers.sent.flatMap((sent, i) =>
    sent ? [{ id: `m${i + 1}`, from: senderOf(i + 1), to: receiverOf(i + 1), label: `message ${i + 1}`, lost: !run.messengers.delivered[i] }] : [],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Disagree" value={pctText(pDisagree(k, p), 2)} color="var(--bad)" sub={`p(1 − p)^${k - 1}; ${counts.disagree} of ${2 ** k} patterns`} />
          <Stat label="Both attack" value={pctText(pBoth(k, p), 2)} color="var(--ok)" sub={`(1 − p)^${k}; ${counts.both} of ${2 ** k} patterns`} />
          <Stat label="Nobody attacks" value={pctText(pNobody(k, p), 2)} sub={`safe, but nothing happens; ${counts.nobody} of ${2 ** k} patterns`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a messenger that arrived', shape: 'line' },
            { color: 'var(--bad)', label: 'a captured one (✕)' },
            { color: 'var(--ok)', label: 'agreement to attack' },
            { color: 'var(--bad)', label: 'disagreement' },
            { color: 'var(--dim)', label: 'nobody attacks' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Protocol depth k" value={k} min={DEPTH.min} max={DEPTH.max} onChange={setK} />
          <Slider label="Capture chance p" value={p} min={0} max={LOSS_MAX} step={LOSS_STEP} format={(v) => v.toFixed(2)} onChange={setP} />
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
          <Button disabled={k <= DEPTH.min} onClick={() => setK(k - 1)}>Remove the last message</Button>
        </>,
      ]}
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint="one seeded run: a message is sent only after the one before it arrived">The valley</SectionTitle>
          <SequenceDiagram actors={[{ id: 'A', label: 'General A', tone: 'amber' }, { id: 'B', label: 'General B', tone: 'sky' }]} messages={messages} ariaLabel="The messengers the two generals sent" />
          <p className={`eo-outcome is-${run.outcome}`} role="status">
            {run.outcome === 'both' ? 'Both generals attack.' : run.outcome === 'disagree' ? 'Only one general attacks: the army that attacks alone loses.' : 'Nobody attacks.'}
          </p>
        </Box>
        <Plot2D
          width={narrow ? PLOT_W.narrow : PLOT_W.wide}
          x={{ domain: [1, DEPTH.max], label: 'protocol depth k', ticks: DEPTH.max - 1, format: (v) => String(Math.round(v)) }}
          y={{ domain: [0, 1], label: 'probability', ticks: 4 }}
          ariaLabel="Probability of each outcome against the protocol depth"
        >
          <Curve tone="ok" points={KS.map((x) => [x, pBoth(x, p)])} />
          <Curve tone="bad" points={KS.map((x) => [x, pDisagree(x, p)])} />
          <Curve tone="dim" points={KS.map((x) => [x, pNobody(x, p)])} />
          <Points tone="hi" r={4} data={[{ x: k, y: pDisagree(k, p) }]} />
        </Plot2D>
        <p className="eo-note">The argument that no depth works: take a protocol that always agrees, delete its last message (it might be captured, so the protocol had to cope without it), and the shorter protocol must agree too. Repeat until no messages are left.</p>
        <ProvenanceRow>
          <Provenance kind="toy">the rule (a general attacks if it received every message addressed to it, or sent the last one) illustrates the argument; the proof is in the literature</Provenance>
          <Provenance kind="simulated" seed={seed}>one seeded run of the messengers; the closed forms are checked against enumeration and 100,000 runs in the tests</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
