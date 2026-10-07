import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { chunkCaption } from './frames';
import { CHUNK_DIVISOR, CHUNK_TEXT, CHUNK_WINDOW, chunksOf, compareChunks, INSERTED } from './model';

const START_AT = 70;
const TEXT_LEN = [...CHUNK_TEXT].length;

type Mark = 'kept' | 'new' | 'lost';
/** Neighbouring unchanged chunks alternate, so each boundary shows. */
const KEPT_TONES: readonly Tone[] = ['violet', 'muted'];

export function ChunkScene({ picker }: { picker: ReactNode }) {
  const [at, setAt] = useState(START_AT);
  const edited = useMemo(() => [...CHUNK_TEXT].slice(0, at).join('') + INSERTED + [...CHUNK_TEXT].slice(at).join(''), [at]);
  const cmp = useMemo(() => compareChunks(CHUNK_TEXT, at), [at]);
  const before = chunksOf(CHUNK_TEXT, cmp.before);
  const after = chunksOf(edited, cmp.after);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const reused = after.filter((c) => beforeSet.has(c)).length;
  const fresh = after.length - reused;

  useIntroCaption(chunkCaption(at, cmp.keptBefore, cmp.shiftedAfter, cmp.changed, reused, after.length, fresh), [at, cmp, reused, fresh]);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Chunks" value={`${before.length} → ${after.length}`} color="var(--muted)" sub="before → after the edit" />
          <Stat label="Found again" value={reused} color="var(--ok)" sub="unchanged, nothing to store" />
          <Stat label="New" value={fresh} color="var(--info)" sub="must be stored" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'chunk found again' },
            { color: 'var(--muted)', label: 'the next one found again' },
            { color: 'var(--info)', label: 'new chunk' },
            { color: 'var(--bad)', label: 'chunk lost' },
            { color: 'var(--hi)', label: 'inserted X' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Insert X at" value={at} min={0} max={TEXT_LEN} onChange={setAt} format={(v) => `position ${v}`} />
        </>,
      ]}
    >
      <div className="rh stage-pad">
        <Box className="rh-chunks">
          <SectionTitle>Before</SectionTitle>
          <ChunkRow chunks={before} mark={(c) => (afterSet.has(c) ? 'kept' : 'lost')} insertAt={null} />
        </Box>
        <Box className="rh-chunks">
          <SectionTitle>After inserting {INSERTED} at position {at}</SectionTitle>
          <ChunkRow chunks={after} mark={(c) => (beforeSet.has(c) ? 'kept' : 'new')} insertAt={at} />
        </Box>
        <Hint block>
          A cut goes after any {CHUNK_WINDOW}-character window whose rolling hash ≡ 0 (mod {String(CHUNK_DIVISOR)}), so where cuts fall depends
          only on nearby content. Deduplicating backup tools such as restic and borg cut files this way, with bigger windows and chunks
          averaging kilobytes; this short paragraph uses tiny ones so several cuts fit. Computed live.
        </Hint>
      </div>
    </StageFrame>
  );
}

function ChunkRow({ chunks, mark, insertAt }: { chunks: string[]; mark: (c: string) => Mark; insertAt: number | null }) {
  const starts = chunks.map((_, i) => chunks.slice(0, i).reduce((sum, c) => sum + [...c].length, 0));
  return (
    <p className="rh-chunk-row">
      {chunks.map((c, i) => {
        const start = starts[i];
        const m = mark(c);
        const tone = m === 'kept' ? KEPT_TONES[i % 2] : m === 'new' ? 'info' : 'bad';
        return (
          <span key={`${i}-${start}`} className={`rh-chunk tone-${tone} is-${m}`}>
            {[...c].map((ch, k) =>
              insertAt !== null && start + k === insertAt ? (
                <mark key={k} className="rh-inserted">{ch}</mark>
              ) : (
                ch
              ),
            )}
          </span>
        );
      })}
    </p>
  );
}
