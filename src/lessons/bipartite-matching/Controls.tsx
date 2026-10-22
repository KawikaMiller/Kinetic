import { Button, ChipButton, ControlGroup, Hint } from '../../components/ui';
import { MAX_SIDE, PRESETS } from './model';
import type { MatchEditor } from './useMatchEditor';

export function PresetChips({ ed }: { ed: MatchEditor }) {
  return (
    <ControlGroup label="Graph">
      {PRESETS.map((p) => (
        <ChipButton key={p.id} on={p.id === ed.presetId} onClick={() => ed.load(p.id)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>
  );
}

/** Add or remove a worker or a job, and say how to toggle an edge. */
export function EditRow({ ed }: { ed: MatchEditor }) {
  const g = ed.graph;
  return (
    <>
      <Button onClick={ed.addWorker} softDisabled={g.workers >= MAX_SIDE}>
        Add worker
      </Button>
      <Button onClick={ed.removeWorker} softDisabled={g.workers <= 1}>
        Remove last worker
      </Button>
      <Button onClick={ed.addJob} softDisabled={g.jobs >= MAX_SIDE}>
        Add job
      </Button>
      <Button onClick={ed.removeJob} softDisabled={g.jobs <= 1}>
        Remove last job
      </Button>
      <Hint>Click a worker, then a job, to add or remove the edge between them (up to {MAX_SIDE} of each).</Hint>
    </>
  );
}
