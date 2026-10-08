import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { crashPoints, writeSequence, type DiskImage, type Mode, type NoJournalOrder } from './crash';
import { crashCaption, HOME_NAME, MODE_NAME, writeLabel } from './crashText';

const MODES: Mode[] = ['none', 'journal', 'ordered', 'writeback'];
const ORDERS: { value: NoJournalOrder; label: string }[] = [
  { value: 'DIB', label: 'data, inode, bitmap' },
  { value: 'BID', label: 'bitmap, inode, data' },
  { value: 'IDB', label: 'inode, data, bitmap' },
];

function DiskPanel({ title, img, journal }: { title: string; img: DiskImage; journal: boolean }) {
  return (
    <div className="fs-col fs-grow fs-disk">
      <SectionTitle>{title}</SectionTitle>
      <ul className="fs-homes">
        <li className={img.data === 'new' ? 'is-new' : ''}>
          <b>{HOME_NAME.D}</b> {img.data === 'new' ? 'new bytes' : 'old bytes (a deleted file’s)'}
        </li>
        <li className={img.inode ? 'is-new' : ''}>
          <b>{HOME_NAME.I}</b> {img.inode ? 'size grown, points at the block' : 'old size, no pointer'}
        </li>
        <li className={img.bitmap ? 'is-new' : ''}>
          <b>{HOME_NAME.B}</b> {img.bitmap ? 'block marked used' : 'block marked free'}
        </li>
      </ul>
      {journal && (
        <div className="fs-journal" aria-label="Journal contents">
          <span>journal:</span>
          {img.log.length === 0 && !img.committed && <i className="empty-note">empty</i>}
          {img.log.map((h) => (
            <span key={h} className="fs-jentry">
              {h}
            </span>
          ))}
          {img.committed && <span className="fs-commit">commit</span>}
        </div>
      )}
    </div>
  );
}

export function CrashScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>('none');
  const [order, setOrder] = useState<NoJournalOrder>('DIB');
  const seq = useMemo(() => writeSequence(mode, order), [mode, order]);
  const points = useMemo(() => crashPoints(mode, order), [mode, order]);
  const [k, setK] = useState(1);
  const at = Math.min(k, seq.length);
  const p = points[at];
  const setCaption = useSetCaption();
  const caption = useMemo(() => crashCaption(mode, p, seq.length), [mode, p, seq.length]);
  useEffect(() => setCaption(caption, { quiet: true }), [caption, setCaption]);

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'last write before the power cut' },
            { color: 'var(--violet)', label: 'inode write' },
            { color: 'var(--info)', label: 'data block write' },
            { color: 'var(--muted)', label: 'bitmap write' },
            { color: 'var(--dim)', label: 'writes never made (faded, dashed)' },
            { color: 'var(--sky)', label: 'journal entry' },
            { color: 'var(--ok)', label: 'commit record' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Journal" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: MODE_NAME[m] }))} />
          {mode === 'none' && <Segmented label="Write order" value={order} onChange={setOrder} options={ORDERS} />}
          <Slider
            label="Power cut"
            value={at}
            min={0}
            max={seq.length}
            onChange={setK}
            format={(v) => (v === 0 ? 'before any write' : v === seq.length ? `after all ${v} writes` : `after write ${v} of ${seq.length}`)}
          />
        </>,
      ]}
    >
      <div className="fs stage-pad">
        <div>
          <SectionTitle>Appending one block: the writes, in order</SectionTitle>
          <ol className="fs-writes">
            {seq.map((w, i) => {
              const kind = w.kind === 'commit' ? 'commit' : w.kind === 'log' ? 'log' : `home-${w.what}`;
              return (
                <li key={i} style={{ order: 2 * i }} className={`fs-w is-${kind} ${i < at ? 'is-done' : 'is-pending'} ${i === at - 1 ? 'is-now' : ''}`}>
                  {writeLabel(w)}
                </li>
              );
            })}
            <li className="fs-cut" style={{ order: 2 * at - 1 }} aria-label="power cut">
              ⚡ power cut
            </li>
          </ol>
        </div>
        <div className="fs-walk">
          <DiskPanel title="On disk when the power went" img={p.before} journal={mode !== 'none'} />
          <DiskPanel title="After the reboot (journal replayed or discarded)" img={p.after} journal={false} />
        </div>
        <ul className="fs-verdict">
          {p.outcome.complete && <li className="is-ok">complete and consistent</li>}
          {!p.outcome.complete && p.outcome.problems.length === 0 && <li className="is-lost">append lost, file system consistent</li>}
          {p.outcome.problems.map((x) => (
            <li key={x} className="is-bad">
              {x === 'stale-data' ? 'inode points at old data' : x === 'leak' ? 'leaked block' : 'block in use but marked free'}
            </li>
          ))}
        </ul>
        <Hint block>
          {mode === 'none' ? (
            <>Without a journal the kernel may write these three blocks in any order; three orders are shown. A later fsck can find a leak or a double-used block, but can't bring back lost data.</>
          ) : mode === 'writeback' ? (
            <>In writeback mode only metadata is journaled; the data block may reach the disk before or after the commit. It's shown landing after it, the case that goes wrong.</>
          ) : (
            <>Each block write is atomic; a group of them isn't. The commit record is what turns the logged writes into one all-or-nothing transaction.</>
          )}{' '}
          Simplified from ext4's documented journal modes: one transaction, three blocks.
        </Hint>
      </div>
    </StageFrame>
  );
}
