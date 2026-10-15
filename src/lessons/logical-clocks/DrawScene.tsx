import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { selectedItem, type LaneMode } from '../../core/laneEditor';
import { ruleText } from './clocks';
import { drawCaption } from './captions';
import { ExecutionEditor } from './ExecutionEditor';
import { PRESETS, PROCESSES, viewOf } from './execution';
import type { ExecutionState } from './useExecution';

const MODE_OPTIONS = [{ value: 'edit' as const, label: 'Event' }, { value: 'link' as const, label: 'Message' }];

export function DrawScene({ picker, exec }: { picker: ReactNode; exec: ExecutionState }) {
  const [mode, setMode] = useState<LaneMode>('edit');
  const { model } = exec;
  const view = useMemo(() => viewOf(model), [model]);
  const chosen = selectedItem(model);
  const selected = chosen ? (view.byId.get(chosen.id) ?? null) : null;
  const rule = selected === null ? null : ruleText(view.stamps[selected], PROCESSES[view.stamps[selected].lane]);
  const largest = Math.max(0, ...view.stamps.map((s) => s.lamport));

  useIntroCaption(drawCaption(view, selected, model.links.length), [model, selected]);

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Events" value={view.stamps.length} sub={`${model.links.length} messages`} />
          <Stat label="Largest Lamport stamp" value={largest} sub="one number per event" />
          <Stat label="Vector length" value={PROCESSES.length} sub="one counter per process" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'P1' },
            { color: 'var(--pink)', label: 'P2' },
            { color: 'var(--sky)', label: 'P3' },
            { color: 'var(--info)', label: 'a message', shape: 'line' },
            { color: 'var(--hi)', label: 'the selected event' },
            { color: 'var(--violet)', label: 'a vector counter this event raised' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" size="md" on={exec.loaded === p.id} onClick={() => exec.load(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="A press adds a" value={mode} onChange={setMode} options={MODE_OPTIONS} />
          <Button disabled={!exec.canUndo} onClick={exec.undo}>Undo</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <ExecutionEditor model={model} onChange={exec.change} onRefuse={exec.setMessage} mode={mode} view={view} showStamps ariaLabel="An execution: events on three processes joined by messages" />
        <p className="lc-status" role="status">{exec.message || `${view.stamps.length} of ${model.limits.maxItems} events placed.`}</p>
        <Box className="lc-rules">
          <SectionTitle>The rules</SectionTitle>
          <ul className="lc-rule-list">
            <li className={rule ? 'is-live' : ''}>
              <b>Lamport:</b> a local event or a send does L ← L + 1; a receive does L ← max(L, message) + 1.
              {rule && <span className="lc-rule-now"> Here: {rule.lamport}.</span>}
            </li>
            <li className={rule ? 'is-live' : ''}>
              <b>Vector:</b> a local event or a send does V[i] ← V[i] + 1; a receive takes the componentwise max of V and the message, then V[i] ← V[i] + 1.
              {rule && <span className="lc-rule-now"> Here: {rule.vector}.</span>}
            </li>
          </ul>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">the executions are drawn by you or hand-built presets; nothing is recorded from a real system</Provenance>
          <Provenance kind="from-memory">Lamport clocks are from Lamport's 1978 paper; vector clocks come from independent work in the late 1980s by Fidge and Mattern, check the papers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
