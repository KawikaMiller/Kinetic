import { useState } from 'react';
import { clampResidues, type System } from './crt';
import { formatSystem, parseSystem } from './presets';

export interface SystemState {
  system: System;
  draft: string;
  /** The refusal while the typed text is unusable (the last good system stays), else null. */
  error: string | null;
  type: (text: string) => void;
  setModulus: (i: number, m: number) => void;
  setResidue: (i: number, a: number) => void;
  /** All the remainders at once (a click on a pair of remainders). */
  setResidues: (residues: number[]) => void;
  load: (s: System) => void;
}

/** The gears' moduli and remainders: sliders and a typed field that edit the same system, and the field's refusal. */
export function useSystem(initial: System, maxGears: number): SystemState {
  const [system, setSystem] = useState<System>(initial);
  const [draft, setDraft] = useState(formatSystem(initial));
  const [error, setError] = useState<string | null>(null);

  const commit = (s: System) => {
    setSystem(s);
    setDraft(formatSystem(s));
    setError(null);
  };
  return {
    system,
    draft,
    error,
    type: (text) => {
      setDraft(text);
      const parsed = parseSystem(text, maxGears);
      if (parsed.ok) {
        setSystem(parsed.value);
        setError(null);
      } else {
        setError(parsed.error);
      }
    },
    setModulus: (i, m) => {
      const moduli = system.moduli.map((x, k) => (k === i ? m : x));
      commit({ moduli, residues: clampResidues(moduli, system.residues) });
    },
    setResidue: (i, a) => commit({ moduli: system.moduli, residues: system.residues.map((x, k) => (k === i ? a : x)) }),
    setResidues: (residues) => commit({ moduli: system.moduli, residues: clampResidues(system.moduli, residues) }),
    load: commit,
  };
}
