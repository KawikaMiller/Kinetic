import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { integer } from '../../core/format';
import { multiCaption } from './captions';
import { DEFAULT_CRASH_AFTER, MESSAGES_PER_PHASE, VALUES, intersections, singleDecreeMessages, stableProposerMessages } from './counting';

const TABLE_SIZES = [3, 5];
/** Narrowest width, px, at which the intersection table reads (its last column is the claim of the table). */
const INTERSECTION_TABLE_MIN_WIDTH = 480;

export function MultiScene({ picker }: { picker: ReactNode }) {
  const [values, setValues] = useState<number>(VALUES.default);
  const [crash, setCrash] = useState(false);
  const crashAfter = crash ? DEFAULT_CRASH_AFTER : null;
  const single = singleDecreeMessages(values);
  const stable = stableProposerMessages(values, crashAfter);
  const rerun = crashAfter !== null && crashAfter < values;
  const tables = useMemo(() => TABLE_SIZES.map(intersections), []);
  const widest = Math.max(single, stable);
  const tied = single === stable;

  return (
    <StageFrame
      height={430}
      intro={multiCaption({ values, single, stable, crashAfter, rerun })}
      introKey={`${values}|${crash}`}
      stats={
        <Stats>
          <Stat label="Single-decree each time" value={integer(single)} sub={`${values} x ${2 * MESSAGES_PER_PHASE} messages`} color={tied ? undefined : 'var(--bad)'} />
          <Stat label="One stable proposer" value={integer(stable)} sub={`${MESSAGES_PER_PHASE} for phase 1${rerun ? ' twice' : ''}, then ${MESSAGES_PER_PHASE} per value`} color={tied ? undefined : 'var(--ok)'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'the costly side of the comparison' }, { color: 'var(--ok)', label: 'the cheap side' }, { color: 'var(--hi)', label: 'an overlap acceptor' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Values to decide" value={values} min={VALUES.min} max={VALUES.max} format={(v) => `${v} values`} onChange={setValues} />
          <Toggle label={`Stable proposer crashes after value ${DEFAULT_CRASH_AFTER}`} value={crash} onChange={setCrash} />
        </>,
      ]}
    >
      <div className="px-stage stage-pad">
        <Box>
          <SectionTitle hint="a counting model: a phase is a request to each acceptor and a reply from each">Messages for {values} values</SectionTitle>
          {[
            { label: 'single-decree each time', n: single, tone: tied ? 'dim' : 'bad' },
            { label: 'one stable proposer', n: stable, tone: tied ? 'dim' : 'ok' },
          ].map((row) => (
            <div key={row.label} className="px-bar-row">
              <span className="px-bar-label">{row.label}</span>
              <span className="px-bar"><i style={{ width: `${(100 * row.n) / widest}%`, background: `var(--${row.tone})` }} /></span>
              <b className="mono">{integer(row.n)}</b>
            </div>
          ))}
          <Hint block>Real systems add client and heartbeat traffic; this counts only the two phases. Raft&apos;s leader plays the role of the stable proposer in spirit.</Hint>
        </Box>
        <Box>
          <SectionTitle hint="exhaustive: every pair of minimal majorities">Why a later proposer sees an earlier vote</SectionTitle>
          <WideRegion minWidth={INTERSECTION_TABLE_MIN_WIDTH} noun="table">
          <table className="data-table">
            <thead><tr><th>acceptors</th><th>majorities</th><th>pairs</th><th>smallest overlap</th><th>every pair shares one</th></tr></thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.acceptors}>
                  <td>{t.acceptors}</td><td>{t.majorities}</td><td>{t.pairs}</td><td>{t.smallestOverlap}</td><td>{t.allIntersect ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </WideRegion>
          <Hint block>The shared acceptor reports its vote in its promise, so a proposer that gathers a majority learns of any value that a majority already voted for. The replicated-register version of this overlap, R + W &gt; N, is the quorums lesson.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a message-counting model, not a measurement</Provenance>
          <ClaimLabel kind="view">Raft's leader is comparable to a stable proposer: one reading, not an equivalence</ClaimLabel>
          <Provenance kind="from-memory">Multi-Paxos as the common practical form; check a systems text</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
