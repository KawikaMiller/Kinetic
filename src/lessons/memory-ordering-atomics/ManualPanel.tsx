import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, Hint } from '../../components/ui';
import type { Litmus } from '../../core/memModel';
import { MachineView } from './MachineView';
import { allMoves, applyMove, blockedReason, initialState, isFinished, outcomeKey, toSnapshot, type ManualModel, type Move } from './manual';
import { outcomeText, scCountText } from './model';

const moveName = (m: Move) => (m.kind === 'step' ? `step T${m.thread}` : `drain T${m.thread}'s buffer`);

/** Drive the machine by hand: step a thread or drain a buffer, and try to reach the surprising outcome. SC and x86-style only. */
export function ManualPanel({ litmus, model, targetKey, targetMeaning }: { litmus: Litmus; model: ManualModel; targetKey: string; targetMeaning: string }) {
  const [state, setState] = useState(() => initialState(litmus));
  const [log, setLog] = useState<string[]>([]);
  const moves = allMoves(litmus, model);
  const finished = isFinished(litmus, state);
  const press = (m: Move) => {
    if (blockedReason(litmus, state, m) !== null) return;
    const done = applyMove(litmus, state, m, model);
    setState(done.state);
    setLog((l) => [...l, done.text]);
  };
  const reset = () => { setState(initialState(litmus)); setLog([]); };
  const reasons = moves.flatMap((m) => { const r = blockedReason(litmus, state, m); return r ? [`${moveName(m)}: ${r}`] : []; });
  const reached = finished && outcomeKey(state) === targetKey;

  return (
    <Box>
      <SectionTitle hint="try to reach the surprising outcome by hand">Step it yourself</SectionTitle>
      <MachineView litmus={litmus} snap={toSnapshot(state)} model={model} />
      <div className="moa-moves">
        {moves.map((m) => <Button key={moveName(m)} softDisabled={blockedReason(litmus, state, m) !== null} onClick={() => press(m)}>{moveName(m)}</Button>)}
        <Button onClick={reset}>Restart</Button>
      </div>
      <Hint block tone="faint"><span role="status">{reasons.length ? `Not available now: ${reasons.join('; ')}.` : 'Every move is available.'}</span></Hint>
      {log.length > 0 && <ol className="moa-log">{log.map((x, i) => <li key={i}>{x}</li>)}</ol>}
      {finished && (
        <p className="moa-note" role="status">
          Finished with {outcomeText(outcomeKey(state))}.{' '}
          {reached ? `That is the surprising outcome: ${targetMeaning}.` : 'That is not the surprising outcome.'}
          {model === 'sc' && !reached && ` Under SC there are ${scCountText(litmus)}.`}
        </p>
      )}
    </Box>
  );
}
