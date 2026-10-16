import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Provenance, ProvenanceRow, Segmented, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { bugIntro, outboxFrames, outcomeSummary } from './captions';
import { bugSetup, initialBug, parseAmount } from './init';
import { OUTBOX_LEGEND, OutboxPanels, OutboxStats } from './OutboxPanels';
import { CASE_FAULTS, CONSUMER_DELAY_MS, DUAL_DESIGNS, FAULT_LABEL, OUTCOME_WORD, caseTable, outcomeOf, runOutbox, type Design, type Fault, type Outcome } from './outbox';

const DESIGN_OPTIONS = [
  { value: 'dbfirst' as const, label: 'Database first, then publish' },
  { value: 'pubfirst' as const, label: 'Publish first, then database' },
];
const FAULT_OPTIONS = (['none', 'before', 'between', 'after', 'publish-fails'] as Fault[]).map((f) => ({ value: f, label: FAULT_LABEL[f] }));
const SHORT: Record<Design, string> = { dbfirst: 'database first', pubfirst: 'publish first', outbox: 'outbox' };
const OUTCOME_CLASS: Record<Outcome, string> = { consistent: 'is-ok', nothing: 'is-ok', 'lost event': 'is-bad', ghost: 'is-bad', duplicate: 'is-orange' };
const PLAY_MS = 150;

export function BugScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialBug);
  const setup = useMemo(() => bugSetup(state), [state]);
  const run = useMemo(() => runOutbox(setup), [setup]);
  const table = useMemo(() => caseTable(), []);
  const frames = useMemo(() => outboxFrames(run, bugIntro(state.design, state.fault), outcomeSummary(run)), [run, state.design, state.fault]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;

  const commitAmount = () => {
    const a = parseAmount(state.text);
    setState((s) => (a.ok ? { ...s, amount: a.value, text: String(a.value), refusal: null } : { ...s, refusal: a.error }));
  };

  return (
    <StageFrame
      height={520}
      player={player}
      stats={<OutboxStats run={run} now={now} />}
      legend={OUTBOX_LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Order of the two steps" value={state.design} onChange={(design) => setState((s) => ({ ...s, design }))} options={DESIGN_OPTIONS} />
        </>,
        <>
          <Segmented label="Crash point" value={state.fault} onChange={(fault) => setState((s) => ({ ...s, fault }))} options={FAULT_OPTIONS} />
          <TextField label="Order amount" value={state.text} onChange={(text) => setState((s) => ({ ...s, text, refusal: null }))} onEnter={commitAmount} onBlur={commitAmount} width={80} spellCheck={false} />
          <Button onClick={() => setState(initialBug())}>Reset</Button>
          {state.refusal && <span className="ob-refusal" role="status">{state.refusal}</span>}
        </>,
      ]}
    >
      <div className="ob-stage stage-pad">
        <OutboxPanels run={run} now={now} showOutbox={false} />
        <Box>
          <SectionTitle hint="every cell is a run of the simulator; press one to load it">Every crash point against both orders</SectionTitle>
          <div className="ob-scroll" role="region" aria-label="Outcome of every crash point for both orders of the steps" tabIndex={0}>
            <table className="data-table ob-table">
              <thead>
                <tr>
                  <th scope="col">Crash point</th>
                  {DUAL_DESIGNS.map((d) => (
                    <th key={d} scope="col">{SHORT[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CASE_FAULTS.map((fault) => (
                  <tr key={fault}>
                    <th scope="row">{FAULT_LABEL[fault]}</th>
                    {DUAL_DESIGNS.map((design) => {
                      const cell = table.find((c) => c.fault === fault && c.design === design)!;
                      const here = state.fault === fault && state.design === design;
                      return (
                        <td key={design} className={`ob-cell ${OUTCOME_CLASS[cell.outcome]}${here ? ' is-here' : ''}`}>
                          <button type="button" className="ob-cell-btn" aria-pressed={here} onClick={() => setState((s) => ({ ...s, design, fault }))}>
                            {cell.outcome}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ob-note">The run on screen: {OUTCOME_WORD[outcomeOf(run)]}.</p>
          <p className="ob-note">The consumer here handles an event {CONSUMER_DELAY_MS} ms after it arrives, which is why a ghost is settled by then. Publishing first puts the event on the broker a few tens of milliseconds before the commit, so a consumer that read at once would act on a ghost even with no crash at all.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a service, a toy database, a broker and a consumer on the distSim harness; the crash instants are fixed so each case is one exact run</Provenance>
          <Provenance kind="toy">toy database: commit order and ids modelled, not a real engine</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
