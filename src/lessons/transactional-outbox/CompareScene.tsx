import { useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, ClaimLabel, Hint, Provenance, ProvenanceRow, Toggle } from '../../components/ui';
import { COMPARE_SEEDS, compareAll, initialCompare } from './init';
import type { RuleId } from './outbox';

const RULES: { id: RuleId; label: string }[] = [
  { id: 'O1', label: 'No ghost (O1)' },
  { id: 'O2', label: 'No loss (O2)' },
  { id: 'O3', label: 'Effect once (O3)' },
];

export function CompareScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCompare);
  const [results, setResults] = useState<ReturnType<typeof compareAll> | null>(null);

  // Running every design takes about a second: let the scene paint first, with a busy note, then compute.
  useEffect(() => {
    const id = setTimeout(() => setResults(compareAll()), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <StageFrame
      height={420}
      intro={
        <>
          Every design is run over the same {COMPARE_SEEDS} seeded schedules with crashes in the service and the relay and two orders in flight. A cell is green when the rule held on all of them, red with the lowest seed that broke it.
        </>
      }
      introKey={String(state.dedupe)}
      controls={
        <>
          {picker}
          <Toggle label="Consumer" value={state.dedupe} onChange={(dedupe) => setState({ dedupe })} off="No inbox" on="Skips a seen event id" />
          <Button onClick={() => setState(initialCompare())}>Reset</Button>
        </>
      }
    >
      <div className="ob-stage stage-pad">
        <Box>
          <SectionTitle hint="computed by running each design, not typed">What each design guarantees</SectionTitle>
          {results === null && <Hint tone="muted" block>Running {COMPARE_SEEDS} schedules per design, with and without the inbox...</Hint>}
          {results !== null && (
          <div className="ob-scroll" role="region" aria-label="Guarantees of each design over the seeded schedules" tabIndex={0}>
            <table className="data-table ob-table table-cards">
              <thead>
                <tr>
                  <th scope="col">Design</th>
                  {RULES.map((r) => (
                    <th key={r.id} scope="col">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const broken = state.dedupe ? row.inbox : row.plain;
                  return (
                    <tr key={row.id}>
                      <th scope="row" data-label="Design">{row.label}</th>
                      {RULES.map((r) => {
                        const seed = broken[r.id];
                        return (
                          <td key={r.id} data-label={r.label} className={seed === null ? 'ob-cell is-ok' : 'ob-cell is-bad'}>
                            {seed === null ? `held on ${COMPARE_SEEDS} seeds` : `broken, lowest seed ${seed}`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" data-label="Design">Two-phase commit across the database and the broker</th>
                  <td data-label="What it asks" colSpan={3} className="ob-text">Needs both systems to support it, and blocks while the coordinator is down.</td>
                </tr>
                <tr>
                  <th scope="row" data-label="Design">Listen to your own events</th>
                  <td data-label="What it asks" colSpan={3} className="ob-text">Publish first and let the service act on the event it hears, so the event log is the source of truth; a different pattern, not run here.</td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
          <Hint tone="muted">The last two rows are named, not simulated.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">{COMPARE_SEEDS} seeded schedules per design on the distSim harness, the same schedules for every row</Provenance>
          <Provenance kind="toy">toy database and a toy broker; the rules are checked against the lesson&apos;s own model of each design</Provenance>
          <ClaimLabel kind="practice">two-phase commit blocking on a failed coordinator, from the distributed transactions lesson, from memory</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
