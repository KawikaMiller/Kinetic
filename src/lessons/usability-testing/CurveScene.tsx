import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { curveCaption } from './captions';
import {
  CURVE_PARTICIPANTS, DEFAULT_PARTICIPANTS, NIELSEN_LANDAUER_L, PROBLEMS, expectedFound, foundAfter, hitList, nielsenLandauer, participantsFor, runSessions,
} from './model';

const L_RANGE = { min: 0.05, max: 0.6, step: 0.01 } as const;
const TARGET = 0.8;
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function CurveScene({ picker }: { picker: ReactNode }) {
  const [l, setL] = useState(NIELSEN_LANDAUER_L);
  const [n, setN] = useState(DEFAULT_PARTICIPANTS);
  const sessions = useMemo(() => runSessions(CURVE_PARTICIPANTS), []);
  const observed = Array.from({ length: CURVE_PARTICIPANTS + 1 }, (_, k) => ({ x: k, y: foundAfter(sessions, k).length / PROBLEMS.length, tone: 'ok' as const }));
  const found = foundAfter(sessions, n).length;
  useIntroCaption(curveCaption(l, n, found, PROBLEMS.length), [l, n]);

  return (
    <StageFrame
      height={470}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: '1 − (1 − L)ⁿ, the model', shape: 'line' },
            { color: 'var(--violet)', label: 'the same, for these three problems', shape: 'line' },
            { color: 'var(--ok)', label: 'found in this simulated test', shape: 'dot' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label={`Model at ${n}`} value={pct(nielsenLandauer(l, n))} />
          <Stat label="This test found" value={`${found} of ${PROBLEMS.length}`} />
          <Stat label={`To reach ${percent(TARGET)}`} value={`${participantsFor(l, TARGET)} participants`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Participants" value={n} min={1} max={CURVE_PARTICIPANTS} onChange={setN} />
          <Slider label="L, chance of meeting a problem" value={l} min={L_RANGE.min} max={L_RANGE.max} step={L_RANGE.step} onChange={setL} format={(v) => v.toFixed(2)} />
        </>,
      ]}
    >
      <div className="ut stage-pad">
        <Plot2D
          x={{ domain: [0, CURVE_PARTICIPANTS], label: 'participants', ticks: 5 }}
          y={{ domain: [0, 1], label: 'share of problems found', format: percent }}
          ariaLabel="Share of usability problems found against number of participants"
        >
          <HLine at={TARGET} label={percent(TARGET)} tone="dim" />
          <VLine at={n} label={`${n}`} />
          <Curve fn={expectedFound} tone="violet" dashed />
          <Curve fn={(x) => nielsenLandauer(l, x)} tone="info" />
          <Points data={observed} r={3.5} />
        </Plot2D>
        <Box className="ut-results">
          <table className="data-table">
            <thead>
              <tr><th>Problem</th><th>Meets it</th><th>Found by</th></tr>
            </thead>
            <tbody>
              {PROBLEMS.map((p) => {
                const first = sessions.findIndex((s) => hitList(s).includes(p.id));
                return (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    <td>{percent(p.p)}</td>
                    <td>{first < 0 ? 'nobody in 15' : `participant ${first + 1}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <Hint block>
          Simulated participants with seeded behaviour. The model gives every problem the same L; the three problems here are met by 50%, 33% and 10%, which is why the violet curve sits below the blue one. The 31% figure is Nielsen and Landauer&apos;s 1993 average, not a law: it varies a lot by product and task, and a rare problem needs far more people than a single average suggests.
        </Hint>
      </div>
    </StageFrame>
  );
}
