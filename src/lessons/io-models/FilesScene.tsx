import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { filesCaption } from './captions';
import { CQ_DEPTH, DEFAULT_TARGET, SQ_DEPTH, canComplete, canEnter, canQueue, canReap, complete, emptyRings, enter, queueRead, readiness, reap, type Rings, type Target } from './files';

const TARGET_OPTIONS = [{ value: 'socket' as const, label: 'A socket' }, { value: 'file' as const, label: 'A regular file' }];

/** A row of boxes standing for a queue: filled up to `count`. */
function queueBoxes(count: number, capacity: number, tone: string) {
  return Array.from({ length: capacity }, (_, i) => <i key={i} className={`iom-slot ${i < count ? 'is-full' : ''}`} style={i < count ? { background: tone } : undefined} />);
}

export function FilesScene({ picker }: { picker: ReactNode }) {
  const [target, setTarget] = useState<Target>(DEFAULT_TARGET);
  const [rings, setRings] = useState<Rings>(emptyRings);
  const facts = readiness(target);
  const act = (f: (r: Rings) => Rings) => setRings((r) => f(r));

  return (
    <StageFrame
      height={380}
      intro={filesCaption(target, rings)}
      introKey={[target, rings]}
      stats={
        <Stats>
          <Stat label="epoll_ctl(ADD)" value={facts.epollAdd === 'ok' ? 'ok' : 'EPERM'} color={facts.epollAdd === 'ok' ? 'var(--ok)' : 'var(--bad)'} sub={facts.epollAdd === 'ok' ? 'registered' : 'refused: the file does not support epoll'} />
          <Stat label="In flight" value={rings.inflight} color="var(--info)" sub="handed to the kernel, not finished" />
          <Stat label="Calls into the kernel" value={rings.enters} sub={`${rings.total} requests queued so far`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'accepted, or a completion collected', shape: 'square' },
            { color: 'var(--bad)', label: 'refused (EPERM)', shape: 'square' },
            { color: 'var(--info)', label: 'in flight in the kernel', shape: 'square' },
            { color: 'var(--hi)', label: 'queued or completed, waiting for the program', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="What you wait on" value={target} onChange={setTarget} options={TARGET_OPTIONS} />
        </>,
        <>
          <Button onClick={() => act(queueRead)} softDisabled={!canQueue(rings)}>Queue a read</Button>
          <Button variant="primary" onClick={() => act(enter)} softDisabled={!canEnter(rings)}>Enter the kernel (submit the batch)</Button>
          <Button onClick={() => act(complete)} softDisabled={!canComplete(rings)}>Kernel finishes one</Button>
          <Button onClick={() => act(reap)} softDisabled={!canReap(rings)}>Collect completions</Button>
          <Button onClick={() => setRings(emptyRings())}>Reset</Button>
        </>,
      ]}
    >
      <div className="iom-stage stage-pad">
        <Box>
          <SectionTitle hint="readiness: ask whether a read would block">What epoll, select and poll say</SectionTitle>
          <table className="data-table iom-table">
            <tbody>
              <tr><th scope="row">epoll_ctl(ADD)</th><td>{facts.epollAdd === 'ok' ? 'accepted' : 'refused with EPERM'}</td></tr>
              <tr><th scope="row">select / poll</th><td>{facts.pollSays}</td></tr>
              <tr><th scope="row">A read may still block</th><td>{facts.readCanBlock ? 'yes: the disk, not the fd, is what is slow' : 'no: it was reported ready'}</td></tr>
              <tr><th scope="row">So the program</th><td>{facts.advice}</td></tr>
            </tbody>
          </table>
        </Box>
        <Box>
          <SectionTitle hint="completion: hand over the work, collect the result">Two queues, submit and complete</SectionTitle>
          <div className="iom-queues">
            <div><span className="iom-qname">Submission queue ({rings.queued} of {SQ_DEPTH})</span><div className="iom-slots">{queueBoxes(rings.queued, SQ_DEPTH, 'var(--hi)')}</div></div>
            <div><span className="iom-qname">In flight in the kernel ({rings.inflight}{rings.inflight > SQ_DEPTH ? `, the first ${SQ_DEPTH} drawn` : ''})</span><div className="iom-slots">{queueBoxes(rings.inflight, SQ_DEPTH, 'var(--info)')}</div></div>
            <div><span className="iom-qname">Completion queue ({rings.cq} of {CQ_DEPTH})</span><div className="iom-slots">{queueBoxes(rings.cq, CQ_DEPTH, 'var(--hi)')}</div></div>
            <div><span className="iom-qname">Collected: {rings.reaped}</span></div>
          </div>
          <Hint tone="muted" block>One call hands over the whole submission queue, however many reads are in it.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">epoll_ctl refuses regular files with EPERM and select/poll call them always readable (seen once on one Linux 6.18 kernel under WSL2, not run here): check man 7 epoll for yours</Provenance>
          <Provenance kind="toy">the two queues are drawn after io_uring's; the sizes (8 and 16) are invented, and real rings, flags and kernels differ</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
