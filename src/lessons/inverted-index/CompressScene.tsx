import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { tokenize } from './analyzer';
import { compressCaption } from './captions';
import { docName } from './corpus';
import { docIds } from './postings';
import { BIG_SEED, DEFAULT_EXPONENT, POSTINGS_SHOWN, encodeVByte, seededIds, sizesOf, toGaps } from './vbyte';
import type { Corpus } from './useCorpus';

type Source = 'corpus' | 'big';
const SOURCE_OPTIONS = [{ value: 'corpus' as const, label: 'This corpus' }, { value: 'big' as const, label: 'A big collection' }];
const MIN_EXPONENT = 2;
const MAX_EXPONENT = 7;
const NEW_DOC_TEXT = 'the cat chased the dog around the garden';
const hex = (b: number) => b.toString(16).padStart(2, '0');

export function CompressScene({ picker, corpus }: { picker: ReactNode; corpus: Corpus }) {
  const [source, setSource] = useState<Source>('corpus');
  const [exponent, setExponent] = useState(DEFAULT_EXPONENT);
  const [draft, setDraft] = useState(NEW_DOC_TEXT);
  const { index, steps } = corpus;

  const busiest = useMemo(() => [...index.postings.keys()].sort((a, b) => index.postings.get(b)!.length - index.postings.get(a)!.length || a.localeCompare(b))[0], [index]);
  const ids = useMemo(() => (source === 'corpus' ? (busiest ? docIds(index, busiest) : []) : seededIds(POSTINGS_SHOWN, 10 ** exponent, BIG_SEED)), [source, exponent, busiest, index]);
  const gaps = toGaps(ids);
  const sizes = sizesOf(ids);
  const label = source === 'corpus' ? (busiest ? `The list for "${busiest}"` : 'An empty index') : `${POSTINGS_SHOWN} documents among ${(10 ** exponent).toLocaleString('en-US')}`;
  const touched = [...new Set(tokenize(draft, steps))];

  useIntroCaption(compressCaption({ count: ids.length, sizes, source: label }), [ids, source, exponent]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Fixed 4-byte ids" value={sizes.fixed} color="var(--bad)" sub="bytes" />
          <Stat label="Variable-byte ids" value={sizes.ids} color="var(--info)" sub="bytes" />
          <Stat label="Variable-byte gaps" value={sizes.gaps} color="var(--ok)" sub="bytes: the smallest" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a byte with the continuation bit set: more follow', shape: 'square' },
            { color: 'var(--ok)', label: 'the last byte of a number', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Posting list" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
          {source === 'big' && <Slider label="Collection size" value={exponent} min={MIN_EXPONENT} max={MAX_EXPONENT} format={(v) => (10 ** v).toLocaleString('en-US')} onChange={setExponent} />}
        </>,
        <>
          <TextField label="A new document" value={draft} onChange={setDraft} width={260} spellCheck={false} />
        </>,
      ]}
    >
      <div className="ii-stage stage-pad">
        <Box>
          <SectionTitle hint="ids, gaps from the previous id, and each gap in variable-byte form">{label}</SectionTitle>
          {ids.length === 0 ? (
            <p className="empty-note">No postings to show.</p>
          ) : (
            <div className="ii-scroll" role="region" aria-label="Posting list as ids, gaps and bytes" tabIndex={0}>
              <table className="data-table ii-table">
                <thead><tr><th scope="col">Id</th><th scope="col">Gap</th><th scope="col">Bytes of the gap</th></tr></thead>
                <tbody>
                  {ids.map((id, i) => (
                    <tr key={id}>
                      <td>{source === 'corpus' ? docName(id - 1) : id.toLocaleString('en-US')}</td>
                      <td>{gaps[i].toLocaleString('en-US')}</td>
                      <td>
                        {encodeVByte(gaps[i]).map((b, k, all) => (
                          <span key={k} className={`ii-byte ${k < all.length - 1 ? 'is-more' : 'is-last'}`}>{hex(b)}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Hint tone="muted" block>Each byte holds 7 bits of the number, and its top bit says whether another byte follows: one common scheme, among others. Small gaps fit one byte, which is why a long list of nearby ids shrinks.</Hint>
        </Box>
        <Box>
          <SectionTitle hint="why updates are expensive">Adding a document</SectionTitle>
          <p className="ii-update">
            <b>{touched.length}</b> {touched.length === 1 ? 'posting list' : 'posting lists'} would grow to take this document{touched.length > 0 ? `: ${touched.join(', ')}` : ''}. One new document touches many lists, so real engines write new immutable segments and merge them in the background, the same idea as an LSM tree.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">the encoder and decoder are real code, checked for round trips in the tests</Provenance>
          <Provenance kind="simulated" seed={BIG_SEED}>the big collection is a seeded list of document ids</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
