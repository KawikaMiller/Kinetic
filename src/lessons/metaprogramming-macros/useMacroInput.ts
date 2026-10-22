import { useState } from 'react';
import { parseCall, parseMacroDef, type CallParse, type MacroDef } from './macroLang';
import { MACRO_PRESETS, type MacroPreset } from './opening';

type GoodCall = Extract<CallParse, { ok: true }>;

export interface MacroInput {
  definitionText: string;
  callText: string;
  /** The last definition and call that parsed: what the scene expands while the typed text is refused. */
  def: MacroDef;
  call: GoodCall;
  /** The text of that definition and that call. */
  definitionSource: string;
  callSource: string;
  definitionError: string | null;
  callError: string | null;
  presetId: string | null;
  setDefinition: (text: string) => void;
  setCall: (text: string) => void;
  loadPreset: (preset: MacroPreset) => void;
}

interface State {
  definitionText: string;
  callText: string;
  def: MacroDef;
  call: GoodCall;
  definitionSource: string;
  callSource: string;
  definitionError: string | null;
  callError: string | null;
}

function fromPreset(p: MacroPreset): State {
  const d = parseMacroDef(p.definition);
  const c = parseCall(p.call);
  if (!d.ok || !c.ok) throw new Error(`preset ${p.id} must parse`);
  return { definitionText: p.definition, callText: p.call, def: d.value, call: c, definitionSource: p.definition, callSource: p.call, definitionError: null, callError: null };
}

export function useMacroInput(presetId: string): MacroInput {
  const [state, setState] = useState(() => fromPreset(MACRO_PRESETS.find((p) => p.id === presetId)!));
  const setDefinition = (text: string) =>
    setState((prev) => {
      const r = parseMacroDef(text);
      return r.ok ? { ...prev, definitionText: text, def: r.value, definitionSource: text, definitionError: null } : { ...prev, definitionText: text, definitionError: r.error };
    });
  const setCall = (text: string) =>
    setState((prev) => {
      const r = parseCall(text);
      return r.ok ? { ...prev, callText: text, call: r, callSource: text, callError: null } : { ...prev, callText: text, callError: r.error };
    });
  const current = MACRO_PRESETS.find((p) => p.definition === state.definitionText && p.call === state.callText);
  return { ...state, presetId: current?.id ?? null, setDefinition, setCall, loadPreset: (p) => setState(fromPreset(p)) };
}
