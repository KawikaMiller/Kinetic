import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { lakeCaption } from './captions';
import { initialLakeScene } from './init';
import {
  FILE_ROWS, append, cleanOrphans, crashWriter, currentFiles, deleteRows, directoryRows, initialLake, orphanFiles, race, readAfterCrash, readSnapshot, readTable, readerVsWriter,
} from './tableformat';

const DELETE_ROWS = 2;
const rowsText = (rows: number[]) => (rows.length === 0 ? 'no rows' : rows.join(' '));

export function LakeScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialLakeScene);
  const [note, setNote] = useState('');
  const { lake, layer, viewing } = state;

  const clean = useMemo(() => cleanOrphans(lake), [lake]);
  const rvw = useMemo(() => readerVsWriter(clean, layer), [clean, layer]);
  const rc = useMemo(() => race(clean), [clean]);
  const orphans = orphanFiles(lake);
  const seen = layer ? readTable(lake) : directoryRows(lake);
  const committed = readTable(lake);
  const crash = readAfterCrash(lake, layer);
  const shown = viewing !== null && lake.snapshots.some((s) => s.id === viewing) ? viewing : lake.current;
  const travelled = readSnapshot(lake, shown);

  useIntroCaption(lakeCaption(lake, layer, viewing, rvw, rc), [lake, layer, viewing, rvw, rc]);

  const act = (next: typeof lake, message: string) => {
    setState((s) => ({ ...s, lake: next, viewing: null }));
    setNote(message);
  };
  const oldest = committed.slice(0, DELETE_ROWS);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Reader sees" value={plural(seen.length, 'row')} color={crash.kind === 'committed' ? 'var(--ok)' : 'var(--bad)'} sub={layer ? `through the pointer, snapshot ${lake.current}` : 'by listing the directory'} />
          <Stat label="Orphan files" value={orphans.length} color={orphans.length > 0 ? 'var(--bad)' : undefined} sub="written, never committed" />
          <Stat label="Torn reads" value={`${rvw.torn} of ${rvw.total}`} color={rvw.torn > 0 ? 'var(--bad)' : 'var(--ok)'} sub="writer and reader interleavings" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the current-snapshot pointer', shape: 'square' },
            { color: 'var(--ok)', label: 'a file in the current snapshot', shape: 'square' },
            { color: 'var(--dim)', label: 'an orphan file (written, never committed) or an older file', shape: 'square' },
            { color: 'var(--info)', label: 'a time-travelled snapshot', shape: 'square' },
            { color: 'var(--bad)', label: 'a failed commit or a torn read', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Table format" value={layer} onChange={(v) => setState((s) => ({ ...s, layer: v }))} off="None: list the directory" on="Snapshots and a pointer" />
        </>,
        <>
          <Button onClick={() => act(append(lake), `Appended ${FILE_ROWS} rows as a new file and a new snapshot ${lake.snapshots.length + 1}.`)}>Append {FILE_ROWS} rows</Button>
          <Button onClick={() => act(deleteRows(lake, oldest), `Deleted rows ${oldest.join(' and ')}: the files holding them were rewritten, the old files stay.`)} softDisabled={committed.length < DELETE_ROWS}>Delete the oldest {DELETE_ROWS}</Button>
          <Button onClick={() => act(crashWriter(lake, 1), 'A writer wrote one file and crashed before it switched the pointer.')}>Crash after file A</Button>
          <Button onClick={() => act(crashWriter(lake, 2), 'A writer wrote both files and crashed before it switched the pointer.')}>Crash after both files</Button>
          <Button onClick={() => act(cleanOrphans(lake), 'Orphan files removed.')} softDisabled={orphans.length === 0}>Clean up orphans</Button>
          <Button onClick={() => act(initialLake(), 'Back to the starting lake.')}>Reset</Button>
        </>,
      ]}
    >
      <div className="wl-stage stage-pad">
        <div className="wl-lake">
          <Box>
            <SectionTitle hint="immutable: written once, never changed">Data files</SectionTitle>
            <div className="wl-files">
              {Object.entries(lake.files).map(([name, rows]) => {
                const live = currentFiles(lake).includes(name);
                const orphan = orphans.includes(name);
                return (
                  <span key={name} className={`wl-file ${orphan ? 'tone-dim is-orphan' : live ? 'tone-ok' : 'tone-dim'}`} title={orphan ? 'orphan' : live ? 'in the current snapshot' : 'an older snapshot only'}>
                    {name}: {rowsText(rows)}
                  </span>
                );
              })}
            </div>
          </Box>
          <Box>
            <SectionTitle hint="press one to time travel">Snapshots and the pointer</SectionTitle>
            <div className="wl-files">
              {lake.snapshots.map((s) => (
                <ChipButton key={s.id} tone={s.id === lake.current ? 'hi' : 'info'} on={s.id === shown} onClick={() => setState((st) => ({ ...st, viewing: s.id }))} ariaLabel={`Snapshot ${s.id}: ${s.note}${s.id === lake.current ? ', the current one' : ''}`}>
                  {s.id === lake.current ? `▶ ${s.id}` : s.id}
                </ChipButton>
              ))}
            </div>
            <p className="wl-note">Snapshot {shown} ({lake.snapshots.find((s) => s.id === shown)?.note ?? 'none'}) lists {plural(lake.snapshots.find((s) => s.id === shown)?.files.length ?? 0, 'file')}: rows {rowsText(travelled)}.</p>
          </Box>
        </div>
        <Box>
          <SectionTitle hint={layer ? 'a reader goes through the pointer' : 'a reader lists the directory'}>What a reader sees now</SectionTitle>
          <p className={crash.kind === 'committed' ? 'wl-ok' : 'wl-bad'}>rows {rowsText(seen)}</p>
          {crash.kind !== 'committed' && <p className="wl-note">That includes rows no commit ever made visible: a torn or uncommitted read.</p>}
        </Box>
        <Box>
          <SectionTitle hint={`all ${rvw.total} interleavings of a four-step writer and a two-step reader, run`}>A reader meets a writer</SectionTitle>
          <p className="wl-note">
            {rvw.old} saw the table before the commit, {rvw.new} after it, {rvw.torn === 0 ? <span className="wl-ok">and none saw a mix.</span> : <span className="wl-bad">and {rvw.torn} saw half of the new files.</span>}
          </p>
          {rvw.firstTorn && (
            <ol className="wl-steps" aria-label="One interleaving that tears">
              {rvw.firstTorn.order.map((s, i) => (
                <li key={i} className={s.startsWith('reader') ? 'is-reader' : ''}>{s}</li>
              ))}
              <li className="wl-bad">the reader holds rows {rowsText(rvw.firstTorn.rows)}: half of the new write</li>
            </ol>
          )}
        </Box>
        <Box>
          <SectionTitle hint={`all ${rc.total} interleavings of two writers, run`}>Two writers</SectionTitle>
          <p className="wl-note">
            {rc.withConflict} had a failed compare-and-swap (the loser re-read and retried on top of the winner); {rc.withoutConflict} did not overlap. {rc.lostUpdates === 0 ? <span className="wl-ok">None lost an update.</span> : <span className="wl-bad">{rc.lostUpdates} lost one.</span>}
          </p>
          <ol className="wl-steps" aria-label="Both writers read the same snapshot first">
            {rc.bothReadFirst.order.map((s, i) => (
              <li key={i} className={s.includes('fails') ? 'wl-bad' : ''}>{s}</li>
            ))}
          </ol>
        </Box>
        {note && <p className="wl-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="simulated">file lists and snapshots are modelled here; every claim about interleavings is a run of all of them, not a sample</Provenance>
          <Provenance kind="from-memory">Iceberg, Delta Lake and Hudi are table formats of this kind; their real file layouts and commit protocols differ in detail (check each project&rsquo;s documentation)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
