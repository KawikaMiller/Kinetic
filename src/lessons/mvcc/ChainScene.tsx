import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { CHAIN_UPDATES, chainDb, chainOf, hasReader } from './chain';
import { classifyAll } from './view';

/** What a version of the chain is to the reader: the label of its tone. */
const TONE_CLASS = { ok: 'is-ok', dim: 'is-dim', bad: 'is-bad', hi: 'is-ok', info: 'is-dim', violet: 'is-dim', orange: 'is-dim', amber: 'is-dim', pink: 'is-dim', sky: 'is-dim', muted: 'is-dim' } as const;

export function ChainScene({ picker }: { picker: ReactNode }) {
  const [updates, setUpdates] = useState<number>(CHAIN_UPDATES.initial);
  const [reader, setReader] = useState<number | null>(null);
  const readerAfter = reader === null ? null : Math.min(reader, updates);
  const db = chainDb(updates, readerAfter);
  const chain = chainOf(db);
  const views = classifyAll(db, hasReader(db) ? 1 : 'auto');
  const rails = db.versions.map((v, i) => [v.vid, views[i]] as const);
  const railOf = (vid: number) => rails.find(([id]) => id === vid)![1];

  useIntroCaption(
    <>
      Row A was updated {updates} {updates === 1 ? 'time' : 'times'}, so it is a chain of {chain.length} {chain.length === 1 ? 'version' : 'versions'}: each UPDATE appended a new one and stamped the old one&apos;s xmax with its own id.{' '}
      {hasReader(db) ? <>The reader that began after update {readerAfter} reads <span className="hl ok">v{chain.find((v) => railOf(v.vid).tone === 'ok')?.vid}</span>; the versions it has outlived are <span className="hl bad">dead</span>.</> : <>No reader holds a snapshot, so only the newest version is visible and the older {chain.length - 1} are dead.</>}
    </>,
    [updates, readerAfter],
  );

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Updates to A" value={updates} sub="each one appends a version" />
          <Stat label="Versions of A" value={chain.length} color="var(--info)" sub={`${chain.filter((v) => v.xmax === null).length} with no xmax`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'visible to the reader' }, { color: 'var(--dim)', label: 'too new for the reader' }, { color: 'var(--bad)', label: 'dead: nobody can see it' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Updates to A" value={updates} min={CHAIN_UPDATES.min} max={CHAIN_UPDATES.max} onChange={setUpdates} />
          <Segmented
            label="A reader begins"
            value={readerAfter === null ? 'none' : String(readerAfter)}
            onChange={(v) => setReader(v === 'none' ? null : Number(v))}
            options={[{ value: 'none', label: 'never' }, ...Array.from({ length: updates + 1 }, (_, k) => ({ value: String(k), label: `after update ${k}` }))]}
          />
        </>,
      ]}
    >
      <div className="mv-stage stage-pad">
        <ol className="mv-chain" aria-label="The versions of row A, oldest first">
          {chain.map((v, i) => {
            const view = railOf(v.vid);
            return (
              <li key={v.vid} className={`mv-ver ${TONE_CLASS[view.tone]}`}>
                <b>v{v.vid}</b>
                <span>A = {v.value}</span>
                <span>xmin x{v.xmin}</span>
                <span>xmax {v.xmax === null ? '–' : `x${v.xmax}`}</span>
                <em>{view.label}</em>
                {i < chain.length - 1 && <i className="mv-arrow" aria-hidden="true">→</i>}
              </li>
            );
          })}
        </ol>
        <ProvenanceRow>
          <Provenance kind="toy">the chain is the engine&apos;s own: a simplified PostgreSQL-style table, no HOT updates</Provenance>
          <Provenance kind="from-memory">other engines keep old versions in an undo log instead of in the table: verify per engine</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
