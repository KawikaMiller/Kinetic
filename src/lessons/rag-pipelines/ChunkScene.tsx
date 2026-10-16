import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { PREPARED, OVERLAP_MAX_PCT, OVERLAP_STEP_PCT, SIZE_MAX, SIZE_MIN, SIZE_STEP } from './chunker';
import { chunkCaption, cos } from './captions';
import { EVAL_QUESTIONS } from './corpus';
import { CHUNK_DEFAULT } from './settings';
import { WORD_RANGE, chunkView } from './views';

const WASH = ['sky', 'pink', 'amber'] as const;

export function ChunkScene({ picker }: { picker: ReactNode }) {
  const [doc, setDoc] = useState<string>(CHUNK_DEFAULT.doc);
  const [size, setSize] = useState<number>(CHUNK_DEFAULT.size);
  const [overlapPct, setOverlapPct] = useState<number>(CHUNK_DEFAULT.overlapPct);
  const view = useMemo(() => chunkView(doc, size, overlapPct), [doc, size, overlapPct]);
  const p = PREPARED[view.docIndex];
  const caption = chunkCaption(view, size, overlapPct);

  const words = p.words.map((w, i) => {
    const owners = view.chunks.map((c, n) => (c.start <= i && i < c.end ? n : -1)).filter((n) => n >= 0);
    const gold = view.gold && view.gold.start <= i && i < view.gold.end;
    const cls = ['rag-w', owners.length ? `is-${WASH[owners[0] % WASH.length]}` : 'is-none', owners.length > 1 && 'is-shared', gold && (view.inside ? 'is-gold' : 'is-split')]
      .filter(Boolean).join(' ');
    return <span key={i} className={cls}>{w} </span>;
  });

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Chunks on this page" value={view.chunks.length} sub={`longest ${view.longest} words`} />
          <Stat label="Gold sentence" value={!view.gold ? '–' : view.inside ? 'inside one chunk' : `split over ${view.touching}`} color={!view.gold ? undefined : view.inside ? 'var(--ok)' : 'var(--orange)'} sub={view.question ? view.question.text : 'no evaluation question points here'} />
          <Stat label="Cosine with the question" value={view.cosine === null ? '–' : cos(view.cosine)} color="var(--info)" sub={view.cosine === null ? 'no chunk holds the sentence' : 'best chunk that holds it'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'chunks, alternating washes', shape: 'square' },
            { color: 'var(--hi)', label: 'gold sentence, whole in a chunk', shape: 'square' },
            { color: 'var(--orange)', label: 'gold sentence split', shape: 'square' },
            { color: 'var(--muted)', label: 'dashed underline: in two chunks', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Page" value={view.docIndex + 1} min={1} max={PREPARED.length} onChange={(v) => setDoc(PREPARED[v - 1].doc.id)} format={(v) => `${v} of ${PREPARED.length}`} />
          <ControlGroup label="Pages with a question" inline>
            {EVAL_QUESTIONS.map((q) => (
              <ChipButton key={q.id} tone="info" on={doc === q.doc} onClick={() => setDoc(q.doc)}>{q.id.toUpperCase()}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Slider label="Chunk size" value={size} min={SIZE_MIN} max={SIZE_MAX} step={SIZE_STEP} onChange={setSize} format={(v) => `${v} words`} />
          <Slider label="Overlap" value={overlapPct} min={0} max={OVERLAP_MAX_PCT} step={OVERLAP_STEP_PCT} onChange={setOverlapPct} format={(v) => `${v}%`} />
        </>,
      ]}
    >
      <div className="rag-stage stage-pad">
        <Box>
          <SectionTitle hint={p.doc.title}>One page, cut into chunks</SectionTitle>
          <p className="rag-text">{words}</p>
          <Hint tone="muted" block>Words are the unit here, a stand-in for tokens. Every word belongs to at least one chunk; a dashed underline marks the words two chunks share. The vector-search lesson asked how to find the nearest stored vector fast; this lesson asks what each stored vector should be a vector of, and a chunk boundary decides that.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">invented documents: {PREPARED.length} help pages of a made-up brand, {WORD_RANGE[0]} to {WORD_RANGE[1]} words each</Provenance>
          <Provenance kind="illustrative">word counts stand in for tokens</Provenance>
          <Provenance kind="toy">TF-IDF stand-in: retrieval by word overlap, not a neural embedding</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
