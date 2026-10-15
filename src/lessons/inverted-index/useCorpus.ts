import { useMemo, useState } from 'react';
import { ALL_STEPS, type Steps } from './analyzer';
import { DEFAULT_DOCS, MAX_DOCS, cleanDoc, docName } from './corpus';
import { buildIndex, type Index } from './postings';

export interface Corpus {
  docs: string[];
  steps: Steps;
  index: Index;
  /** The last thing the learner did that was refused or changed (a cut document, the corpus cap), or ''. */
  note: string;
  setDoc: (i: number, typed: string) => void;
  addDoc: (text: string) => void;
  removeDoc: (i: number) => void;
  setSteps: (patch: Partial<Steps>) => void;
  reset: () => void;
}

/** The corpus the four scenes share: the documents, the analyzer steps and the index built from them. */
export function useCorpus(): Corpus {
  const [docs, setDocs] = useState<string[]>([...DEFAULT_DOCS]);
  const [steps, setStepsState] = useState<Steps>(ALL_STEPS);
  const [note, setNote] = useState('');
  const index = useMemo(() => buildIndex(docs, steps), [docs, steps]);

  return {
    docs,
    steps,
    index,
    note,
    setDoc: (i, typed) => {
      const c = cleanDoc(typed);
      setDocs((d) => d.map((x, k) => (k === i ? c.text : x)));
      setNote(c.truncated ? `${docName(i)} was cut at its first characters: a document here holds at most 280.` : '');
    },
    addDoc: (text) => {
      if (docs.length >= MAX_DOCS) {
        setNote(`The index holds ${MAX_DOCS} documents at most.`);
        return;
      }
      const c = cleanDoc(text);
      setDocs([...docs, c.text]);
      setNote('');
    },
    removeDoc: (i) => {
      setDocs((d) => d.filter((_, k) => k !== i));
      setNote('');
    },
    setSteps: (patch) => setStepsState((s) => ({ ...s, ...patch })),
    reset: () => {
      setDocs([...DEFAULT_DOCS]);
      setStepsState(ALL_STEPS);
      setNote('');
    },
  };
}
