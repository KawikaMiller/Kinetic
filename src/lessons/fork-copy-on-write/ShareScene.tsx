import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { shareCaption } from './captions';
import { FD_READ_BYTES, FILE_BYTES, forkShare, openingShare, readShared, shareRows, type ShareState } from './share';

export function ShareScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ShareState>(openingShare);
  const [parent, child] = s.mmu.alive;
  const rows = shareRows(s);
  const read = (pid: number) => {
    const next = readShared(s, pid);
    if (next) setS(next);
  };

  return (
    <StageFrame
      height={380}
      intro={shareCaption(s)}
      introKey={[s]}
      stats={
        <Stats>
          <Stat label="fork() in the parent" value={parent.forkReturn === null ? 'not called' : parent.forkReturn} color="var(--info)" sub="the child's pid" />
          <Stat label="fork() in the child" value={child ? 0 : 'no child yet'} color="var(--violet)" sub="zero marks the child" />
          <Stat label="Shared file offset" value={s.offset} sub={`of ${FILE_BYTES} bytes`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'shared by both processes', shape: 'square' },
            { color: 'var(--info)', label: 'copy-on-write: shared until written', shape: 'square' },
            { color: 'var(--hi)', label: 'differs between parent and child', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => setS(forkShare(s, parent.pid))} softDisabled={!!child}>fork()</Button>
          <Button onClick={() => read(parent.pid)} softDisabled={s.offset >= FILE_BYTES}>Parent reads {FD_READ_BYTES} bytes of fd 3</Button>
          <Button onClick={() => child && read(child.pid)} softDisabled={!child || s.offset >= FILE_BYTES}>Child reads {FD_READ_BYTES} bytes of fd 3</Button>
          <Button onClick={() => setS(openingShare())}>Reset</Button>
        </>,
      ]}
    >
      <div className="fk-stage stage-pad">
        <Box>
          <SectionTitle hint="press fork() and read the two cards, then read from fd 3 in either process">Parent and child</SectionTitle>
          <div className="fk-cards">
            {[parent, child].map((p, i) => (
              <div key={i} className={`fk-card ${p ? '' : 'is-empty'}`}>
                <b>{p ? `P${p.pid}` : 'no child yet'}</b>
                <span>{p ? (p.forkReturn === null ? 'fork() not called' : `fork() returned ${p.forkReturn}`) : 'press fork()'}</span>
                {p && <span>{p.threads} {p.threads === 1 ? 'thread' : 'threads'}</span>}
              </div>
            ))}
          </div>
          <table className="data-table fk-table">
            <thead><tr><th scope="col">What</th><th scope="col">Parent</th><th scope="col">Child</th><th scope="col">After fork</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.thing}><th scope="row">{r.thing}</th><td>{r.parent}</td><td>{r.child}</td><td className={`fk-${r.verdict}`}>{r.verdict === 'shared' ? 'shared' : r.verdict === 'copied' ? 'copy-on-write' : 'differs'}</td></tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>Both processes' fd 3 point at one open file description, so a read by either moves the offset for both.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">one open file of {FILE_BYTES} bytes and a made-up thread count of 3; the fork() return values and the shared offset follow POSIX</Provenance>
          <Provenance kind="from-memory">only the calling thread exists in the child, and open file descriptions are shared: check man 2 fork</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
