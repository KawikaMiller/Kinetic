import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { usePlayer } from '../../core/usePlayer';
import { tokenize } from './analyzer';
import { queryCaption } from './captions';
import { DEFAULT_QUERY, docName } from './corpus';
import { mergeFrames } from './frames';
import { evaluate, parseQuery, whyEmpty, type ListOrder, type Op } from './query';
import type { Corpus } from './useCorpus';

const CELL_PX = 30;
const STRIP_PAD_PX = 40;
const OP_OPTIONS = [{ value: 'and' as const, label: 'AND' }, { value: 'or' as const, label: 'OR' }];
const ORDER_OPTIONS = [{ value: 'shortest-first' as const, label: 'Shortest list first' }, { value: 'as-typed' as const, label: 'As typed' }];

/** The words of a text split into plain pieces and pieces that analyze to one of the wanted tokens. */
function highlight(text: string, wanted: ReadonlySet<string>, steps: Corpus['steps']): ReactNode[] {
  return text.split(/([A-Za-z0-9]+)/).map((piece, i) => (i % 2 === 1 && tokenize(piece, steps).some((t) => wanted.has(t)) ? <mark key={i} className="ii-hit">{piece}</mark> : piece));
}

export function QueryScene({ picker, corpus }: { picker: ReactNode; corpus: Corpus }) {
  const [text, setText] = useState(DEFAULT_QUERY);
  const [op, setOp] = useState<Op>('and');
  const [order, setOrder] = useState<ListOrder>('shortest-first');
  const { index, steps, docs } = corpus;

  const q = useMemo(() => parseQuery(text, steps), [text, steps]);
  const e = useMemo(() => evaluate(index, q, op, order), [index, q, op, order]);
  const otherOrder: ListOrder = order === 'as-typed' ? 'shortest-first' : 'as-typed';
  const other = useMemo(() => evaluate(index, q, op, otherOrder).comparisons, [index, q, op, otherOrder]);
  const empty = e.docs.length === 0 ? whyEmpty(index, q) : null;
  const first = e.merges[0];
  const frames = useMemo(() => (first ? mergeFrames(first.left, first.right, first.kind, first.steps) : [{ i: null, j: null, out: [], keptLeft: [], keptRight: [], skippedLeft: [], skippedRight: [], say: <>Nothing to merge: the query reads at most one list.</> }]), [first]);
  const player = usePlayer(frames, { interval: 900, autoplayOnChange: false });
  const f = player.frame;
  const wanted = new Set([...q.units.flat()]);

  useIntroCaption(queryCaption({ e, op, order, other, notes: q.notes, empty }), [e, op, order, other, empty]);

  const strip = (values: readonly number[], kept: number[], skipped: number[], at: number | null, label: string, tone: 'hi' | 'info') => (
    <WideRegion minWidth={Math.max(values.length, 4) * CELL_PX + STRIP_PAD_PX} label={`${label} posting list: scroll sideways to see all of it`}>
      <ArrayStrip
        values={[...values]}
        cellState={(i) => (i === at ? (tone === 'hi' ? 'active' : 'info') : kept.includes(i) ? 'done' : skipped.includes(i) ? 'dim' : 'idle')}
        pointers={at === null ? [] : [{ i: at, label, tone: tone === 'hi' ? 'info' : 'violet' }]}
        cellMax={CELL_PX + 14}
        fontSize={12}
      />
    </WideRegion>
  );

  return (
    <StageFrame
      height={470}
      player={first ? player : undefined}
      stats={
        <Stats>
          <Stat label="Comparisons" value={e.comparisons} color="var(--info)" sub={op === 'and' && e.order.length > 1 ? `${order === 'shortest-first' ? 'shortest first' : 'as typed'}; the other order: ${other}` : 'ids compared while merging'} />
          <Stat label="Documents" value={e.docs.length} color={e.docs.length ? 'var(--ok)' : 'var(--bad)'} sub={`of ${docs.length}, none of them scanned`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the id being compared on the left', shape: 'square' },
            { color: 'var(--info)', label: 'the second cursor, on the right', shape: 'square' },
            { color: 'var(--ok)', label: 'an id that went into the result', shape: 'square' },
            { color: 'var(--dim)', label: 'an id skipped or removed', shape: 'square' },
            { color: 'var(--hi)', label: 'a matched word in a document', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Query" value={text} onChange={setText} width={190} spellCheck={false} placeholder='cat dog -mat "cat sat"' />
          <Segmented label="Combine words with" value={op} onChange={setOp} options={OP_OPTIONS} />
          {op === 'and' && <Segmented label="Merge order" value={order} onChange={setOrder} options={ORDER_OPTIONS} />}
        </>,
      ]}
    >
      <div className="ii-stage stage-pad">
        <Box>
          <SectionTitle hint={first ? `the first merge of the query: ${first.kind}` : 'no merge needed'}>Two posting lists, merged</SectionTitle>
          {first ? (
            <>
              {strip(first.left, f.keptLeft, f.skippedLeft, f.i, 'L', 'hi')}
              {strip(first.right, f.keptRight, f.skippedRight, f.j, 'R', 'info')}
              <p className="ii-out" aria-live="polite">result so far: {f.out.length ? f.out.map((d) => docName(d - 1)).join(', ') : 'empty'}</p>
            </>
          ) : (
            <p className="empty-note">{empty ?? 'This query reads one posting list, so its answer is that list.'}</p>
          )}
        </Box>
        <Box>
          <SectionTitle hint="the matched words are highlighted">The documents</SectionTitle>
          {e.docs.length === 0 ? (
            <p className="empty-note">{empty ?? 'No results.'}</p>
          ) : (
            <ul className="ii-results">
              {e.docs.map((d) => (
                <li key={d}><b>{docName(d - 1)}</b> {highlight(docs[d - 1], wanted, steps)}</li>
              ))}
            </ul>
          )}
        </Box>
        {q.notes.length > 0 && <p className="ii-status" role="status">{q.notes.join(' ')}</p>}
        <Hint tone="muted" block>Supported: words, -word to subtract, "two words" for a phrase. Capital AND, OR and NOT, -"two words", parentheses and wildcards are not supported: the first three and the subtracted phrase are refused with a note, the rest read as punctuation.</Hint>
        <ProvenanceRow>
          <Provenance kind="real">the answer is merged from the real posting lists of the corpus you edited, and checked against a scan of every document in the tests</Provenance>
          <Provenance kind="toy">a phrase is checked with word positions counted after the analyzer, so a dropped stop word closes the gap</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
