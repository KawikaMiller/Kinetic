import { useMemo, useState } from 'react';
import { analyse, parseGrammar, predictiveTable, type Analysis, type Grammar } from './grammar';
import { buildAutomaton, buildTable, type LrAutomaton, type LrTable } from './lr';
import { PRESETS, presetGrammar } from './presets';
import { MAX_TOKENS } from './runs';

export interface GrammarInput {
  text: string;
  /** The last grammar that parsed: what the scene draws while the typed text is refused. */
  grammar: Grammar;
  error: string | null;
  /** The preset whose text is in the editor unchanged, or null. */
  presetId: string | null;
  setText: (text: string) => void;
  loadPreset: (id: string) => void;
}

const presetText = (id: string) => PRESETS.find((p) => p.id === id)!.text;

export function useGrammarInput(initialPreset: string): GrammarInput {
  const [state, setState] = useState(() => ({ text: presetText(initialPreset), grammar: presetGrammar(initialPreset), error: null as string | null }));
  const setText = (text: string) =>
    setState((prev) => {
      const r = parseGrammar(text);
      return r.ok ? { text, grammar: r.value, error: null } : { ...prev, text, error: r.error };
    });
  const presetId = PRESETS.find((p) => p.text === state.text)?.id ?? null;
  return { ...state, presetId, setText, loadPreset: (id) => setState({ text: presetText(id), grammar: presetGrammar(id), error: null }) };
}

export interface TokenInput {
  text: string;
  tokens: string[];
  error: string | null;
  setText: (text: string) => void;
  /** Replace the text (a preset's sample). */
  load: (text: string) => void;
}

const splitTokens = (text: string) => text.split(/\s+/).filter(Boolean);

export function useTokenInput(initial: string): TokenInput {
  const [state, setState] = useState({ text: initial, tokens: splitTokens(initial), error: null as string | null });
  const setText = (text: string) =>
    setState((prev) => {
      const tokens = splitTokens(text);
      if (tokens.length > MAX_TOKENS) return { ...prev, text, error: `That is ${tokens.length} tokens; the limit is ${MAX_TOKENS}.` };
      if (tokens.some((t) => t.startsWith('$'))) return { ...prev, text, error: '$ is reserved for the end of input.' };
      return { text, tokens, error: null };
    });
  return { ...state, setText, load: (text) => setState({ text, tokens: splitTokens(text), error: null }) };
}

/** Everything the scenes derive from a grammar, computed once per grammar. */
export interface ParsingModel {
  analysis: Analysis;
  ll: Map<string, number[]>;
  automaton: LrAutomaton;
  lr: LrTable;
}

export function useParsingModel(g: Grammar): ParsingModel {
  return useMemo(() => {
    const analysis = analyse(g);
    const automaton = buildAutomaton(g);
    return { analysis, ll: predictiveTable(g, analysis), automaton, lr: buildTable(automaton, analysis) };
  }, [g]);
}
