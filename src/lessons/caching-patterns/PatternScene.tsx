import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { DiagramPane } from './DiagramPane';
import { patternFrames } from './frames';
import type { Invalidation, Lane } from './model';
import { asideScript, behindScript, behindStartView, PATTERN_TTL, throughScript } from './races';

type PatternId = 'aside' | 'through' | 'behind';
const PATTERNS: { value: PatternId; label: string }[] = [
  { value: 'aside', label: 'Cache-aside' },
  { value: 'through', label: 'Write-through' },
  { value: 'behind', label: 'Write-behind' },
];
const LANES: readonly Lane[] = ['A', 'cache', 'db'];
const LABELS = { A: 'App' } as const;
const STEP_MS = 1500;
const HONEST = 'Simulated cache and database with one key; the values and times are illustrative.';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'cache hit' },
      { color: 'var(--hi)', label: 'miss / fill' },
      { color: 'var(--info)', label: 'database read or write' },
      { color: 'var(--violet)', label: 'invalidation (delete)' },
      { color: 'var(--dim)', label: 'TTL expiry' },
      { color: 'var(--sky)', label: 'write into the cache' },
      { color: 'var(--orange)', label: 'stale value' },
      { color: 'var(--bad)', label: 'writes lost' },
    ]}
  />
);

export function PatternScene({ picker }: { picker: ReactNode }) {
  const [pattern, setPattern] = useState<PatternId>('aside');
  const [invalidate, setInvalidate] = useState<Invalidation>('delete');
  const [crash, setCrash] = useState(false);

  const script = useMemo(() => {
    if (pattern === 'behind') {
      const beats = behindScript(crash);
      const last = beats.at(-1)!;
      return {
        beats,
        start: behindStartView(),
        intro: <><b>Write-behind</b>: a write goes to the cache and to a queue, and the database is updated later by a flush job. Writes are fast and can be batched.</>,
        point: crash
          ? <>The crash lost <span className="hl bad">{last.state.lost} acknowledged writes</span> ($13 and $14): everything queued after the last flush. The database is left at {last.state.db}. Write-behind trades durability for speed.</>
          : <>With no crash, the last flush brings the database to {last.state.db}. Turn on the crash to see what the queue was protecting.</>,
      };
    }
    if (pattern === 'through') {
      const s = throughScript();
      return {
        ...s,
        intro: <><b>Write-through</b>: the cache layer sits in front of the database. A miss is loaded by the layer; a write goes through it to the database before it answers. (The layer is assumed to serialise each key.)</>,
        point: <>Cache and database agree after every write, and a read after a write hits until the entry expires or is evicted. The cost: each write pays for both, and values nobody reads still get cached.</>,
      };
    }
    const s = asideScript(invalidate);
    return {
      ...s,
      intro: <><b>Cache-aside</b> (lazy loading): the app looks in the cache first; on a miss it loads from the database and fills the cache itself. A write updates the database, then {invalidate === 'delete' ? <><b>deletes</b> the key</> : <><b>overwrites</b> the key</>}.</>,
      point: <>Reads fill the cache lazily and a write invalidates it by {invalidate === 'delete' ? 'deleting the key, so the next read reloads it' : 'overwriting it with the new value'}. Between a write's two arrows the cache is briefly stale; the races scene shows what concurrency does to that gap.</>,
    };
  }, [pattern, invalidate, crash]);

  const frames = useMemo(() => patternFrames(script.beats, script.intro, script.point, pattern === 'behind' ? null : PATTERN_TTL), [script, pattern]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });

  return (
    <StageFrame
      player={player}
      height={420}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Pattern" value={pattern} onChange={setPattern} options={PATTERNS} />
          {pattern === 'aside' && <Toggle label="On a write" value={invalidate === 'set'} onChange={(v) => setInvalidate(v ? 'set' : 'delete')} off="Delete the key" on="Overwrite the key" />}
          {pattern === 'behind' && <Toggle label="Before the next flush" value={crash} onChange={setCrash} off="Flush runs" on="Cache crashes" />}
        </>,
      ]}
    >
      <div className="stage-pad cp">
        <DiagramPane lanes={LANES} labels={LABELS} beats={script.beats} index={player.frame.index} start={script.start} ariaLabel={`${PATTERNS.find((p) => p.value === pattern)!.label} script`} />
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
