import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { levelById } from '../../core/latencyLadder';
import { ladderCaption } from './frames';
import { LATENCY_TARGET_MS, PATH_DEFAULT, PATH_STEPS, pathBudget, stepMs, type PathStep } from './model';
import { sig } from '../../core/format';

const STEP_TONE: Record<PathStep, 'amber' | 'pink' | 'sky' | 'orange' | 'muted'> = { l1: 'muted', ram: 'amber', nvme: 'pink', dc: 'sky', wan: 'orange' };
const MAX_COUNT: Record<PathStep, number> = { l1: 1000, ram: 1000, nvme: 20, dc: 100, wan: 5 };

export function LadderScene({ picker }: { picker: ReactNode }) {
  const [counts, setCounts] = useState<Record<PathStep, number>>({ ...PATH_DEFAULT });
  const path = pathBudget(counts);
  useIntroCaption(ladderCaption(path), [counts]);
  const axis = Math.max(LATENCY_TARGET_MS, path.totalMs) * 1.05;

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Request path" value={`${sig(path.totalMs)} ms`} color={path.inBudget ? 'var(--ok)' : 'var(--bad)'} sub={[`budget ${LATENCY_TARGET_MS} ms`, path.inBudget ? 'inside the budget' : 'over the budget']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...PATH_STEPS.map((id) => ({ color: `var(--${STEP_TONE[id]})`, label: levelById(id).name })),
            { color: 'var(--ok)', label: 'inside the budget' },
            { color: 'var(--bad)', label: 'over it' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
        </>,
        <>
          {PATH_STEPS.map((id) => (
            <Slider
              key={id}
              label={`${levelById(id).name} × `}
              value={counts[id]}
              min={0}
              max={MAX_COUNT[id]}
              onChange={(v) => setCounts((c) => ({ ...c, [id]: v }))}
            />
          ))}
        </>,
      ]}
    >
      <div className="boe-stage stage-pad">
        <Box className="boe-strip">
          <SectionTitle hint="one chip per kind of step, each repeated as often as the request does it">Latency budget</SectionTitle>
          <Bar
            segments={path.parts.map((p) => ({ value: p.ms, tone: STEP_TONE[p.id] }))}
            max={axis}
            height={18}
            markers={[{ at: LATENCY_TARGET_MS, label: `${LATENCY_TARGET_MS} ms target`, tone: path.inBudget ? 'ok' : 'bad' }]}
            ariaLabel={`Request path totals ${sig(path.totalMs)} milliseconds against a ${LATENCY_TARGET_MS} ms target`}
          />
          <table className="data-table">
            <thead>
              <tr><th>step</th><th>each</th><th>times</th><th>adds</th></tr>
            </thead>
            <tbody>
              {path.parts.map((p) => (
                <tr key={p.id}>
                  <td>{levelById(p.id).name}</td>
                  <td>{sig(stepMs(p.id))} ms</td>
                  <td>{counts[p.id]}</td>
                  <td>{sig(p.ms)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <div className="boe-chips">
          <Provenance kind="from-memory">the latency figures are orders of magnitude from the usual latency-number tables: verify against a current table, and hardware varies</Provenance>
          <Provenance kind="illustrative">the path and the 200 ms budget are made up</Provenance>
        </div>
        <Hint tone="muted" className="boe-note">Typical orders of magnitude, not measurements. The point is the ratios: a cross-continent round trip costs over a million memory reads.</Hint>
      </div>
    </StageFrame>
  );
}
