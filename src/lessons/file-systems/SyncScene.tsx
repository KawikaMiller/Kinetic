import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { afterPowerCut, durableAt, type SyncOutcome } from './crash';
import { CUT_STOPS, msLabel, syncCaption, syncEvents } from './syncText';

const OUTCOME_TEXT: Record<SyncOutcome, string> = { safe: 'safe after reboot', 'data-lost': 'write lost', 'file-missing': 'file missing' };

export function SyncScene({ picker }: { picker: ReactNode }) {
  const [newFile, setNewFile] = useState(false);
  const [fsyncFile, setFsyncFile] = useState(false);
  const [fsyncDir, setFsyncDir] = useState(false);
  const [stop, setStop] = useState(2);
  const t = CUT_STOPS[stop];
  const c = useMemo(() => ({ newFile, fsyncFile, fsyncDir }), [newFile, fsyncFile, fsyncDir]);
  const outcome = afterPowerCut(c, t);
  const d = durableAt(c);
  const events = syncEvents(c);
  const setCaption = useSetCaption();
  const caption = useMemo(() => syncCaption(c, t), [c, t]);
  useEffect(() => setCaption(caption, { quiet: true }), [caption, setCaption]);

  return (
    <StageFrame
      height={360}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'on disk / happened before the cut' },
            { color: 'var(--orange)', label: 'only in memory: lost at the cut' },
            { color: 'var(--dim)', label: 'never happened (after the cut)' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="The file" value={newFile} onChange={setNewFile} off="Already exists" on="Just created" />
          <Toggle label="fsync(fd)" value={fsyncFile} onChange={setFsyncFile} />
          <Toggle label="fsync(dir fd)" value={fsyncDir} onChange={setFsyncDir} />
          <Slider label="Power cut" value={stop} min={0} max={CUT_STOPS.length - 1} onChange={setStop} format={(i) => `${msLabel(CUT_STOPS[i])} after write()`} />
        </>,
      ]}
    >
      <div className="fs stage-pad">
        <div className="fs-walk">
          <div className="fs-col fs-grow">
            <SectionTitle>Timeline (illustrative)</SectionTitle>
            <ol className="fs-events">
              {events.map((e, i) => (
                <li key={e.label} style={{ order: 2 * i }} className={e.at <= t ? 'is-done' : 'is-after'}>
                  <b>{msLabel(e.at)}</b> {e.label}
                </li>
              ))}
              <li className="fs-cutline" style={{ order: 2 * events.filter((e) => e.at <= t).length - 1 }}>⚡ power cut at {msLabel(t)}</li>
            </ol>
          </div>
          <div className="fs-col fs-grow">
            <SectionTitle>At the moment of the cut</SectionTitle>
            <ul className="fs-homes">
              <li className={t >= d.data ? 'is-new' : 'is-lost'}>
                <b>new data</b> {t >= d.data ? 'on disk' : 'only in the page cache'}
              </li>
              <li className={!newFile || t >= d.entry ? 'is-new' : 'is-lost'}>
                <b>directory entry</b> {!newFile ? 'already on disk (old file)' : t >= d.entry ? 'on disk' : 'only in memory'}
              </li>
            </ul>
            <p className={`fs-outcome is-${outcome}`}>{OUTCOME_TEXT[outcome]}</p>
          </div>
        </div>
        <Hint block>
          The directory rule is the portable one from <code>fsync(2)</code>: syncing a file doesn't promise its new name is on disk; fsync the directory too. ext4's journal usually carries the name along
          with the file's fsync, but other file systems don't promise that. Timings are illustrative.
        </Hint>
      </div>
    </StageFrame>
  );
}
