import { useState } from 'react';
import { parseBase, parseExponent, parseModulus, type Triple } from './presets';

export interface TripleState {
  triple: Triple;
  drafts: { base: string; exponent: string; modulus: string };
  /** The refusal for each field while its draft is unusable (the last good value stays in `triple`), else null. */
  errors: { base: string | null; exponent: string | null; modulus: string | null };
  edit: (field: keyof Triple, text: string) => void;
  load: (t: Triple) => void;
}

const parsers = { base: parseBase, exponent: parseExponent, modulus: parseModulus };

/** The learner's base, exponent and modulus: typed drafts, the last values that parsed and each field's refusal. */
export function useTriple(initial: Triple): TripleState {
  const [triple, setTriple] = useState<Triple>(initial);
  const [drafts, setDrafts] = useState({ base: String(initial.base), exponent: String(initial.exponent), modulus: String(initial.modulus) });
  const [errors, setErrors] = useState<TripleState['errors']>({ base: null, exponent: null, modulus: null });

  const edit = (field: keyof Triple, text: string) => {
    setDrafts((d) => ({ ...d, [field]: text }));
    const parsed = parsers[field](text);
    if (parsed.ok) {
      setTriple((t) => ({ ...t, [field]: parsed.value }));
      setErrors((e) => ({ ...e, [field]: null }));
    } else {
      setErrors((e) => ({ ...e, [field]: parsed.error }));
    }
  };
  const load = (t: Triple) => {
    setTriple(t);
    setDrafts({ base: String(t.base), exponent: String(t.exponent), modulus: String(t.modulus) });
    setErrors({ base: null, exponent: null, modulus: null });
  };
  return { triple, drafts, errors, edit, load };
}
