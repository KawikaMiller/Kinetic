import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Bar } from '../../components/Bar';
import { Tray } from '../../components/Panel';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useShake } from '../../core/useShake';
import { motion } from 'motion/react';
import { BrokenReplay } from './BrokenReplay';
import { workbenchCaption } from './captions';
import { KEYS, MAX_VERSIONS, disabledReason, openSlots, tally, type Op, type Timing, type Who } from './engine';
import { VersionTable } from './VersionTable';
import { VALUES, type Workbench } from './useWorkbench';
import { horizonText, snapshotText } from './view';

const TIMINGS = [{ value: 'transaction' as Timing, label: 'per transaction' }, { value: 'statement' as Timing, label: 'per statement' }];
const WHO_OPTIONS: { value: Who; label: string }[] = [
  { value: 'auto', label: 'autocommit' }, { value: 1, label: 'T1' }, { value: 2, label: 'T2' }, { value: 3, label: 'T3' },
];

export function Workbench({ scene, wb, picker }: { scene: 'versions' | 'vacuum'; wb: Workbench; picker: ReactNode }) {
  const { db, who } = wb;
  const [broken, setBroken] = useState(false);
  const { shake } = useShake();
  const last = wb.log[0] ?? null;
  const t = tally(db);
  const open = openSlots(db);
  const closedViewer = who !== 'auto' && !open.includes(who);

  useIntroCaption(workbenchCaption(db, who, scene, last), [db, who, scene, last?.id]);

  const op = (o: Op) => ({ onClick: () => wb.run(o), disabled: disabledReason(db, o) !== null, title: disabledReason(db, o) ?? undefined });
  const reason = closedViewer ? disabledReason(db, { kind: 'select', who }) : null;

  if (scene === 'vacuum' && broken) {
    return <BrokenReplay picker={picker} onBack={() => setBroken(false)} />;
  }

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Viewing as" value={who === 'auto' ? 'autocommit' : `T${who}`} color="var(--info)" sub={snapshotText(db, who)} />
          <Stat label="Versions" value={`${t.total} of ${MAX_VERSIONS}`} sub={`${t.live} live${scene === 'vacuum' ? `, ${t.dead} dead, ${t.pinned} kept` : ''}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'visible to the viewer' },
            { color: 'var(--dim)', label: 'not visible (too new, uncommitted, old)' },
            { color: 'var(--bad)', label: 'dead: nobody can see it' },
            { color: 'var(--hi)', label: 'just written' },
            { color: 'var(--info)', label: 'the viewer\'s snapshot' },
            { color: 'var(--orange)', label: 'refused' },
            ...(scene === 'vacuum' ? [{ color: 'var(--violet)', label: 'kept for the horizon' }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="View as" value={who} onChange={wb.setWho} options={WHO_OPTIONS} />
          {open.length > 0 && <Hint>open: {open.map((s) => `T${s}`).join(', ')}</Hint>}
        </>,
        <>
          <Segmented label="Snapshot" value={db.timing} onChange={wb.setTiming} options={TIMINGS} />
          {wb.timingBlocked && <Hint tone="muted">{wb.timingBlocked}</Hint>}
        </>,
        <>
          <Button variant="primary" {...op({ kind: 'begin' })}>BEGIN</Button>
          <Button {...op({ kind: 'select', who })}>SELECT</Button>
          <span className="mv-chips" role="group" aria-label="Key">
            {KEYS.map((k) => <ChipButton key={k} tone="violet" on={wb.key === k} onClick={() => wb.setKey(k)}>{k}</ChipButton>)}
          </span>
          <span className="mv-chips" role="group" aria-label="Value">
            {VALUES.map((v) => <ChipButton key={v} tone="sky" on={wb.value === v} onClick={() => wb.setValue(v)}>{v}</ChipButton>)}
          </span>
          <Button {...op({ kind: 'update', who, key: wb.key, value: wb.value })}>UPDATE</Button>
          <Button {...op({ kind: 'insert', who, key: wb.key, value: wb.value })}>INSERT</Button>
          <Button variant="danger" {...op({ kind: 'delete', who, key: wb.key })}>DELETE</Button>
          {who !== 'auto' && <Button {...op({ kind: 'commit', who })}>COMMIT</Button>}
          {who !== 'auto' && <Button {...op({ kind: 'rollback', who })}>ROLLBACK</Button>}
          {scene === 'vacuum' && <Button variant="primary" {...op({ kind: 'vacuum' })}>VACUUM</Button>}
          <Button onClick={wb.reset}>Reset</Button>
          {reason && <Hint tone="muted">{reason}</Hint>}
        </>,
        ...(scene === 'vacuum'
          ? [
              <>
                <span className="mv-chips" role="group" aria-label="Presets">
                  <ChipButton tone="info" onClick={() => wb.preset('idle')}>Idle in transaction</ChipButton>
                  <ChipButton tone="info" onClick={() => wb.preset('bloat')}>Bloat from updates</ChipButton>
                </span>
                <Toggle label="VACUUM" value={broken} onChange={setBroken} off="correct" on="broken (replay)" />
              </>,
            ]
          : [
              <>
                <span className="mv-chips" role="group" aria-label="Presets">
                  <ChipButton tone="info" onClick={() => wb.preset('readers')}>Two readers, two answers</ChipButton>
                  <ChipButton tone="info" onClick={() => wb.preset('writers')}>Writer meets writer</ChipButton>
                </span>
              </>,
            ]),
      ]}
    >
      <div className="mv-stage stage-pad">
        <VersionTable db={db} who={who} back={wb.back} onBack={wb.setBack} onPick={wb.setKey} />
        {scene === 'vacuum' && (
          <div className="mv-size">
            <Bar value={t.total} max={MAX_VERSIONS} tone={t.total > MAX_VERSIONS * 0.75 ? 'bad' : 'info'} label={`table size: ${t.total} of ${MAX_VERSIONS} versions`} height={10} ariaLabel={`Table size ${t.total} of ${MAX_VERSIONS} versions`} />
            <p className="mv-horizon">Horizon: {horizonText(db)}.</p>
          </div>
        )}
        <motion.div animate={shake(last?.status === 'refused' || last?.status === 'aborted')}>
          <Tray label="Messages" labelWeight="regular" empty="press BEGIN, or an UPDATE in autocommit" ariaLabel="Messages">
            {wb.log.map((entry) => <p key={entry.id} className={`mv-msg is-${entry.status}`}>{entry.text}</p>)}
          </Tray>
        </motion.div>
        <ProvenanceRow>
          <Provenance kind="toy">a simplified PostgreSQL-style model: no hint bits, no frozen ids, no HOT updates, no wraparound</Provenance>
          <Provenance kind="from-memory">the REPEATABLE READ error text and the wait message follow PostgreSQL as remembered: check the docs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
