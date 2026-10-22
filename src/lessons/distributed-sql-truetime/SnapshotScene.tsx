import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { snapshotCaption } from './captions';
import { READ_TS, X_VERSIONS, Y_VERSIONS, versionAt, type Version } from './truetime';

const TXN_AT = 12;
const DEFAULT_READ = 11;

function VersionTable({ shard, name, versions, at }: { shard: string; name: string; versions: readonly Version[]; at: number }) {
  const picked = versionAt(versions, at);
  return (
    <Box>
      <SectionTitle hint={shard}>Versions of {name}</SectionTitle>
      <table className="data-table">
        <thead><tr><th>timestamp</th><th>value</th><th>this read</th></tr></thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.at} className={picked?.at === v.at ? 'tt-picked' : ''}>
              <td>{v.at}</td><td>{v.value}</td>
              <td>{picked?.at === v.at ? 'returned' : v.at > at ? 'in the future of this read' : 'overwritten'}{v.at === TXN_AT ? ' (the transaction)' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {picked === null && <Hint block>No version at or below {at}: the read returns nothing.</Hint>}
    </Box>
  );
}

export function SnapshotScene({ picker }: { picker: ReactNode }) {
  const [at, setAt] = useState<number>(DEFAULT_READ);
  const x = versionAt(X_VERSIONS, at);
  const y = versionAt(Y_VERSIONS, at);
  const seen = [x?.at === TXN_AT, y?.at === TXN_AT];

  return (
    <StageFrame
      height={400}
      intro={snapshotCaption({ at, x: X_VERSIONS, y: Y_VERSIONS, txnAt: TXN_AT })}
      introKey={`${at}`}
      stats={
        <Stats>
          <Stat label="x on shard 1" value={x ? x.value : 'none'} sub={x ? `written at ${x.at}` : 'no version at or below the read'} color={seen[0] ? 'var(--ok)' : undefined} />
          <Stat label="y on shard 2" value={y ? y.value : 'none'} sub={y ? `written at ${y.at}` : 'no version at or below the read'} color={seen[1] ? 'var(--ok)' : undefined} />
          <Stat label="The transaction" value={seen[0] && seen[1] ? 'visible' : !seen[0] && !seen[1] ? 'invisible' : 'half visible'} color={seen[0] === seen[1] ? 'var(--info)' : 'var(--bad)'} sub={`wrote x and y at timestamp ${TXN_AT}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'the version this read returns' }, { color: 'var(--amber)', label: 'shard 1' }, { color: 'var(--sky)', label: 'shard 2' }, { color: 'var(--ok)', label: 'a version written by the transaction' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Read timestamp" value={at} min={READ_TS.min} max={READ_TS.max} onChange={setAt} />
        </>,
      ]}
    >
      <div className="tt-stage stage-pad">
        <div className="tt-pair">
          <VersionTable shard="shard 1" name="x" versions={X_VERSIONS} at={at} />
          <VersionTable shard="shard 2" name="y" versions={Y_VERSIONS} at={at} />
        </div>
        <Hint block>A read at a timestamp returns the latest version at or below it. One transaction wrote x and y with the same timestamp, so a read at {TXN_AT - 1} sees neither and a read at {TXN_AT} sees both: no timestamp shows half of it.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">two keys on two shards with made-up versions</Provenance>
          <Provenance kind="from-memory">a read at a past timestamp takes no locks in the systems that do this; check the Spanner paper for how</Provenance>
          <ClaimLabel kind="practice">multi-version stores read the latest version at or below a timestamp</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
