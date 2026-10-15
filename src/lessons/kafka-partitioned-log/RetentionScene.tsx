import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { minWidthForText } from '../../core/scale';
import { plainTone } from '../../core/tone';
import { retentionCaption } from './captions';
import {
  DEFAULT_KEPT_SEGMENTS, DEFAULT_POSITION, KEYS, MAX_KEPT_SEGMENTS, MIN_KEPT_SEGMENTS, PRELOAD_KEYS, SEGMENT_SIZE, append, applyCompaction, applyRetention, logEnd, onDisk, preloaded, stateDiff,
  type RetPolicy, type SegLog,
} from './retention';

const CELL_SIZE = { cell: 40 };
const CELL_FONT = 15;
const POLICY_OPTIONS = [{ value: 'retention' as const, label: 'Retention' }, { value: 'compaction' as const, label: 'Compaction' }];

const keyTone = (key: string) => plainTone(KEYS.indexOf(key as (typeof KEYS)[number]));

export function RetentionScene({ picker }: { picker: ReactNode }) {
  const [policy, setPolicy] = useState<RetPolicy>('retention');
  const [log, setLog] = useState<SegLog>(preloaded);
  const [keep, setKeep] = useState(DEFAULT_KEPT_SEGMENTS);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [note, setNote] = useState('');

  const end = logEnd(log);
  const records = useMemo(() => new Map(onDisk(log).map((r) => [r.offset, r])), [log]);
  const rows = Math.max(1, Math.ceil(end / SEGMENT_SIZE));
  const diff = stateDiff(log);
  const pos = Math.min(position, end);

  useIntroCaption(retentionCaption({ policy, log, position: pos, keep }), [policy, log, pos, keep]);

  const send = (key: string, value: number | null) => {
    const r = append(log, key, value);
    if (r.ok) {
      setLog(r.log);
      setNote('');
    } else setNote(r.error);
  };
  const clean = () => setLog(policy === 'retention' ? applyRetention(log, keep) : applyCompaction(log));
  const reset = (next: RetPolicy) => {
    setPolicy(next);
    setLog(preloaded());
    setNote('');
  };

  const shape = {
    rows,
    cols: SEGMENT_SIZE,
    size: CELL_SIZE,
    rowLabels: Array.from({ length: rows }, (_, r) => `${r * SEGMENT_SIZE}`),
    rowDecor: (r: number) => {
      if (r === rows - 1 && end > 0) return { tone: 'hi' as const, label: 'open segment' };
      const any = Array.from({ length: SEGMENT_SIZE }, (_, c) => records.has(r * SEGMENT_SIZE + c)).some(Boolean);
      return any ? null : { tone: 'dim' as const, label: policy === 'retention' ? 'deleted' : 'cleaned away' };
    },
  };

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Log end offset" value={end} sub={`${onDisk(log).length} ${onDisk(log).length === 1 ? 'record' : 'records'} still on disk`} />
          <Stat label="Log start offset" value={log.logStart} sub={policy === 'retention' ? 'retention moves it' : 'compaction never moves it'} />
          <Stat label="Map replay" value={diff.length === 0 ? '✓ same state' : `✗ ${diff.join(', ')} differ`} color={diff.length === 0 ? 'var(--ok)' : 'var(--bad)'} sub="the log on disk, against every update ever sent" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a record: one colour per key (a, b, c); a hollow cell with ∅ is a tombstone', shape: 'square' },
            { color: 'var(--dim)', label: 'an offset no longer on disk (deleted or cleaned away)', shape: 'square' },
            { color: 'var(--info)', label: 'the consumer\'s position (ring)', shape: 'square' },
            { color: 'var(--hi)', label: 'the open segment', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Cleanup policy" value={policy} onChange={reset} options={POLICY_OPTIONS} />
          {policy === 'retention' && <Slider label="Segments kept" value={keep} min={MIN_KEPT_SEGMENTS} max={MAX_KEPT_SEGMENTS} onChange={setKeep} />}
          <Button variant="primary" onClick={clean}>{policy === 'retention' ? 'Run retention' : 'Run the cleaner'}</Button>
          <Button onClick={() => reset(policy)}>Reset the log</Button>
        </>,
        <>
          {KEYS.map((k) => <ChipButton key={k} tone={keyTone(k)} onClick={() => send(k, end + 1)}>{`Update ${k}`}</ChipButton>)}
          {KEYS.map((k) => <ChipButton key={`d${k}`} tone={keyTone(k)} onClick={() => send(k, null)}>{`Delete ${k}`}</ChipButton>)}
          <Slider label="Consumer at offset" value={pos} min={0} max={Math.max(end, 1)} onChange={setPosition} />
        </>,
      ]}
    >
      <div className="kp-stage stage-pad">
        <Box>
          <SectionTitle hint={`${SEGMENT_SIZE} offsets a segment; the number at the left is the segment's first offset; click a cell to put the consumer there`}>One partition's log</SectionTitle>
          <WideRegion minWidth={minWidthForText(cellGridFrame(shape).width, CELL_FONT)} label="The log: scroll sideways to see all of it">
            <CellGrid
              {...shape}
              cell={(r, c) => {
                const o = r * SEGMENT_SIZE + c;
                if (o >= end) return { fill: 'none' };
                const rec = records.get(o);
                if (!rec) return { tone: 'dim', fill: 'outline' };
                return { tone: keyTone(rec.key), fill: rec.value === null ? 'outline' : 'tint', intensity: 0.45, text: `${rec.key}=${rec.value ?? '∅'}` };
              }}
              cellTitle={(r, c) => {
                const o = r * SEGMENT_SIZE + c;
                const rec = records.get(o);
                return o >= end ? '' : rec ? `offset ${o}: ${rec.key} = ${rec.value ?? 'tombstone'}` : `offset ${o}: not on disk`;
              }}
              highlight={pos < end ? [{ r: Math.floor(pos / SEGMENT_SIZE), c: pos % SEGMENT_SIZE, tone: 'info' }] : []}
              onCellClick={(r, c) => setPosition(Math.min(r * SEGMENT_SIZE + c, end))}
              cellAriaLabel={(r, c) => {
                const o = r * SEGMENT_SIZE + c;
                const rec = records.get(o);
                return o >= end ? `offset ${o}, not written yet` : rec ? `offset ${o}, ${rec.key} ${rec.value === null ? 'tombstone' : `equals ${rec.value}`}` : `offset ${o}, not on disk`;
              }}
              ariaLabel={`The log, ${end} offsets in ${rows} segments`}
            />
          </WideRegion>
          <Hint tone="muted" block>
            {policy === 'retention'
              ? 'Retention deletes whole old segments, and the open one always stays. A consumer behind the new start gets an error, not the next record.'
              : 'The cleaner keeps the newest record of each key in the closed segments. The open segment is left alone, offsets keep their numbers, and a tombstone (a null value) is the newest record of its key like any other.'}
          </Hint>
        </Box>
        {note && <p className="kp-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="scripted">a hand-built starting log of {PRELOAD_KEYS.length} updates; you drive the rest</Provenance>
          <Provenance kind="toy">segments of {SEGMENT_SIZE} records, retention by segment count; real segments are far larger and are cut by size or time</Provenance>
          <Provenance kind="from-memory">brokers pick the policy per topic (delete or compact, check the Kafka docs); a tombstone is kept for a while before it is removed, which is not modelled here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
