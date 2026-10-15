import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { analyze } from './analyzer';
import { buildCaption } from './captions';
import { MAX_DOCS, MAX_DOC_CHARS, docName } from './corpus';
import { termsOf } from './postings';
import type { Corpus } from './useCorpus';

const NEW_DOC = 'a new document about a cat';

function Pipeline({ text, steps }: { text: string; steps: Corpus['steps'] }) {
  const a = analyze(text, steps);
  const chip = (cls: string, token: string, key: string) => <span key={key} className={`ii-token ${cls}`}>{token}</span>;
  return (
    <ol className="ii-pipeline">
      <li><b>raw</b><span className="ii-raw">{a.raw || '(empty)'}</span></li>
      <li><b>{steps.lowercase ? 'lowercase' : 'lowercase (off)'}</b><span className="ii-raw">{a.cased || '(empty)'}</span></li>
      <li><b>split</b><span>{a.split.length ? a.split.map((t, i) => chip('', t, `s${i}`)) : <i>no words</i>}</span></li>
      <li><b>{steps.stopWords ? 'drop stop words' : 'stop words (off)'}</b><span>{a.afterStop.length ? a.afterStop.map((t, i) => chip(t.removed ? 'is-removed' : '', t.token, `p${i}`)) : <i>no words</i>}</span></li>
      <li><b>{steps.stem ? 'toy stemmer' : 'stemmer (off)'}</b><span>{a.stemmed.length ? a.stemmed.map((t, i) => chip(t.changed ? 'is-changed' : '', t.changed ? `${t.from} → ${t.token}` : t.token, `m${i}`)) : <i>no terms</i>}</span></li>
    </ol>
  );
}

export function BuildScene({ picker, corpus }: { picker: ReactNode; corpus: Corpus }) {
  const [look, setLook] = useState(1);
  const { index, docs, steps } = corpus;
  const terms = termsOf(index);
  const total = [...index.postings.values()].reduce((n, l) => n + l.length, 0);
  const longest = Math.max(0, ...[...index.postings.values()].map((l) => l.length));
  const shown = Math.min(Math.max(look, 1), Math.max(docs.length, 1));

  useIntroCaption(buildCaption(index), [index]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Documents" value={docs.length} sub={`up to ${MAX_DOCS}`} />
          <Stat label="Distinct terms" value={terms.length} color="var(--violet)" sub="keys of the dictionary" />
          <Stat label="Postings" value={total} sub={`longest list: ${longest}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'a word the stop-word step removed', shape: 'square' },
            { color: 'var(--violet)', label: 'a word the stemmer changed', shape: 'square' },
            { color: 'var(--info)', label: 'a term: a key of the index', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" on={steps.lowercase} onClick={() => corpus.setSteps({ lowercase: !steps.lowercase })}>lowercase</ChipButton>
          <ChipButton tone="info" on={steps.stopWords} onClick={() => corpus.setSteps({ stopWords: !steps.stopWords })}>stop words</ChipButton>
          <ChipButton tone="info" on={steps.stem} onClick={() => corpus.setSteps({ stem: !steps.stem })}>toy stemmer</ChipButton>
          <Hint>splitting on punctuation is always on</Hint>
          <Button onClick={corpus.reset}>Reset the corpus</Button>
        </>,
        <>
          <Slider label="Show the pipeline for document" value={shown} min={1} max={Math.max(docs.length, 1)} onChange={setLook} format={(v) => docName(v - 1)} />
          <Button onClick={() => corpus.addDoc(NEW_DOC)} softDisabled={docs.length >= MAX_DOCS}>Add a document</Button>
        </>,
      ]}
    >
      <div className="ii-stage stage-pad">
        <Box>
          <SectionTitle hint={`edit a text, or delete it; at most ${MAX_DOC_CHARS} characters each`}>The corpus</SectionTitle>
          <div className="ii-docs">
            {docs.length === 0 && <p className="empty-note">No documents.</p>}
            {docs.map((d, i) => (
              <div key={i} className="ii-doc">
                <b className="ii-docname">{docName(i)}</b>
                <TextField value={d} onChange={(typed) => corpus.setDoc(i, typed)} ariaLabel={`Text of ${docName(i)}`} spellCheck={false} className="ii-docfield" />
                <ChipButton tone="bad" ariaLabel={`Delete ${docName(i)}`} onClick={() => corpus.removeDoc(i)}>×</ChipButton>
              </div>
            ))}
          </div>
        </Box>
        {docs.length > 0 && (
          <Box>
            <SectionTitle hint="what the analyzer does to one document">{docName(shown - 1)} through the pipeline</SectionTitle>
            <Pipeline text={docs[shown - 1]} steps={steps} />
          </Box>
        )}
        <Box>
          <SectionTitle hint="a hash map from term to a list sorted by document id">The index: term to postings</SectionTitle>
          {terms.length === 0 ? (
            <p className="empty-note">No terms yet.</p>
          ) : (
            <div className="ii-scroll" role="region" aria-label="Terms and their posting lists" tabIndex={0}>
              <table className="data-table ii-table">
                <thead><tr><th scope="col">Term</th><th scope="col">Docs</th><th scope="col">Postings: document (frequency)</th></tr></thead>
                <tbody>
                  {terms.map((t) => {
                    const list = index.postings.get(t)!;
                    return (
                      <tr key={t}>
                        <td><span className="ii-term">{t}</span></td>
                        <td>{list.length}</td>
                        <td>{list.map((p) => `${docName(p.doc - 1)} (${p.tf})`).join(', ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Box>
        {corpus.note && <p className="ii-status" role="status">{corpus.note}</p>}
        <ProvenanceRow>
          <Provenance kind="toy">a toy corpus and a toy stemmer (strip -ing, -ed, -s); real engines use proper analyzers, and none of this handles other languages</Provenance>
          <Provenance kind="real">the index, the merges and the ranking run live on the text you edit</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
