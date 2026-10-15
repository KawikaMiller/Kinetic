import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { plainTone, type Tone } from '../../core/tone';
import { partitionsCaption } from './captions';
import {
  BURST_SIZE, DEFAULT_PARTITIONS, DEFAULT_SEED, KEY_SETS, MAX_KEY_INPUT, MAX_PARTITIONS, MIN_PARTITIONS, VISIBLE_OFFSETS, appendKeys, burstKeys, distinctKeys, keyShown, lastPlacement,
  leaderBroker, movedKeys, newTopic, normalizeKey, offsetWindow, partitionLengths, partitionOf, type KeySet, type PartRecord, type Topic,
} from './partitioning';

const CELL_FONT = 10;
const keyLetters = (key: string | null): string => (key === null ? '·' : key.slice(0, 2));

export function PartitionsScene({ picker }: { picker: ReactNode }) {
  const [topic, setTopic] = useState<Topic>(() => newTopic(DEFAULT_PARTITIONS));
  const [typed, setTyped] = useState('');
  const [setId, setSetId] = useState<KeySet['id']>('users');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [note, setNote] = useState('');

  const keys = useMemo(() => distinctKeys(topic), [topic]);
  const toneOf = (key: string | null): Tone => (key === null ? 'muted' : plainTone(keys.indexOf(key)));
  const lengths = partitionLengths(topic);
  const n = topic.records.length;
  const moved = useMemo(() => movedKeys(topic), [topic]);
  const win = offsetWindow(topic);
  const set = KEY_SETS.find((s) => s.id === setId)!;

  useIntroCaption(partitionsCaption(topic), [topic]);

  const send = (batch: (string | null)[], burst = false) => {
    const r = appendKeys(topic, batch);
    if (r.ok) {
      setTopic(burst ? { ...r.topic, bursts: r.topic.bursts + 1 } : r.topic);
      setNote('');
    } else setNote(r.error);
  };
  const sendTyped = () => {
    const key = normalizeKey(typed);
    send([key]);
    setNote((old) => (old === '' && key === null ? 'An empty key is a keyless record: it went to the next partition in turn.' : old));
  };

  const byCell = useMemo(() => {
    const m = new Map<string, PartRecord>();
    for (const r of topic.records) m.set(`${r.partition}:${r.offset}`, r);
    return m;
  }, [topic]);
  const recent = topic.records.slice(-VISIBLE_OFFSETS);

  const tapeShape = {
    rows: topic.p,
    cols: win.cols,
    size: 'sm' as const,
    rowLabels: Array.from({ length: topic.p }, (_, i) => `P${i}`),
    colLabels: Array.from({ length: win.cols }, (_, c) => win.from + c),
    rowDecor: (r: number) => ({ tone: 'violet' as const, label: `b${leaderBroker(r)}` }),
  };
  const stripShape = { rows: 1, cols: Math.max(1, recent.length), size: 'sm' as const };

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Records" value={n} sub={n === 0 ? 'none yet' : `${keys.length} distinct ${keys.length === 1 ? 'key' : 'keys'}`} />
          <Stat label="Fullest partition" value={n === 0 ? '–' : pctText(Math.max(...lengths) / n, 0)} color="var(--info)" sub={n === 0 ? undefined : `P${lengths.indexOf(Math.max(...lengths))}, of ${topic.p} (an even split is ${pctText(1 / topic.p, 0)})`} />
          <Stat label="Keys that would move" value={moved.length} color={moved.length > 0 ? 'var(--bad)' : undefined} sub={keys.length === 0 ? 'no keys yet' : `of ${keys.length}, if sent again now`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a record: one colour per key, in four hues (two keys can share one: the letters name the key)', shape: 'square' },
            { color: 'var(--muted)', label: 'a record with no key', shape: 'square' },
            { color: 'var(--violet)', label: 'the leader broker of a partition (rail)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Partitions" value={topic.p} min={n > 0 ? topic.p : MIN_PARTITIONS} max={MAX_PARTITIONS} onChange={(p) => setTopic((t) => ({ ...t, p }))} />
          {n > 0 && <Hint>a topic can gain partitions, never lose them</Hint>}
          <Button onClick={() => { setTopic(newTopic(topic.p)); setNote(''); }} softDisabled={n === 0}>Reset the topic</Button>
        </>,
        <>
          <TextField label="Key" value={typed} onChange={setTyped} onEnter={sendTyped} maxLength={MAX_KEY_INPUT} width={150} spellCheck={false} placeholder="empty = no key" />
          <Button variant="primary" onClick={sendTyped}>Send</Button>
          {KEY_SETS.map((s) => (
            <ChipButton key={s.id} tone="info" on={setId === s.id} onClick={() => setSetId(s.id)}>{s.label}</ChipButton>
          ))}
          <Button onClick={() => send(burstKeys(set, seed, topic.bursts), true)}>Burst of {BURST_SIZE}</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="kp-stage stage-pad">
        <Box>
          <SectionTitle hint="one tape per partition; the number above a cell is its offset">Partitions</SectionTitle>
          <WideRegion minWidth={minWidthForText(cellGridFrame(tapeShape).width, CELL_FONT)} label="Partition tapes: scroll sideways to see all of it">
            <CellGrid
              {...tapeShape}
              cell={(r, c) => {
                const rec = byCell.get(`${r}:${win.from + c}`);
                return rec ? { tone: toneOf(rec.key), fill: 'tint', intensity: 0.45, text: keyLetters(rec.key) } : { tone: 'dim', fill: 'outline' };
              }}
              cellTitle={(r, c) => {
                const rec = byCell.get(`${r}:${win.from + c}`);
                return rec ? `partition ${r}, offset ${rec.offset}: ${rec.key === null ? 'no key' : keyShown(rec.key)}` : '';
              }}
              ariaLabel={`${topic.p} partition tapes holding ${n} records`}
            />
          </WideRegion>
          {n > VISIBLE_OFFSETS && <Hint>the newest {win.cols} offsets are drawn; older ones have scrolled off the left</Hint>}
        </Box>
        <Box>
          <SectionTitle hint={`newest ${Math.min(n, VISIBLE_OFFSETS)} arrivals; the text is the partition`}>Arrival order across partitions</SectionTitle>
          <WideRegion minWidth={minWidthForText(cellGridFrame(stripShape).width, CELL_FONT)} label="Arrival strip: scroll sideways to see all of it">
            <CellGrid
              {...stripShape}
              cell={(_r, c) => (recent[c] ? { tone: toneOf(recent[c].key), fill: 'tint', intensity: 0.45, text: `P${recent[c].partition}` } : { fill: 'none' })}
              cellTitle={(_r, c) => (recent[c] ? `arrival ${recent[c].id}: partition ${recent[c].partition}, offset ${recent[c].offset}` : '')}
              ariaLabel="Records in the order they arrived, with their partitions"
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="hash(key) mod the partition count">Where each key goes</SectionTitle>
          {keys.length === 0 ? (
            <p className="empty-note">No keys yet. Send one above.</p>
          ) : (
            <div className="kp-keys" role="region" aria-label="Where each key goes" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Key</th><th scope="col">Goes to</th><th scope="col">Latest record is in</th></tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const now = partitionOf(k, topic.p);
                    const last = lastPlacement(topic, k)!.partition;
                    return (
                      <tr key={k}>
                        <td><span className={`kp-key tone-${toneOf(k)}`}>{keyShown(k)}</span></td>
                        <td>P{now}</td>
                        <td className={now === last ? '' : 'kp-moved'}>P{last}{now === last ? '' : ' (moves)'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Box>
        {note && <p className="kp-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>bursts are seeded; the topic is a toy of at most 200 records</Provenance>
          <Provenance kind="toy">placement is FNV-1a with murmur3's finaliser, not Kafka's hash, so real partition numbers differ</Provenance>
          <Provenance kind="from-memory">Kafka's default partitioner hashes the key bytes with murmur2 (check the Kafka docs); keyless records here go round-robin, real clients batch them to one partition at a time</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
