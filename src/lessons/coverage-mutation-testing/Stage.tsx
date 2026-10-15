import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { CoverageScene, type SharedState } from './CoverageScene';
import { MutantScene } from './MutantScene';
import { OPENING, presetOf, PRESETS, type PresetId } from './presets';
import type { CodeVariant, Suite } from './suite';
import './styles.css';

const SCENES = [
  { value: 'coverage', label: 'Coverage lies' },
  { value: 'mutants', label: 'Mutants' },
  { value: 'cost', label: 'What it costs' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'coverage' });
  const [suite, setSuiteState] = useState<Suite>(OPENING.suite);
  const [variant, setVariant] = useState<CodeVariant>(OPENING.variant);
  const [activePreset, setActivePreset] = useState<PresetId | null>(OPENING.id);

  const setSuite = (s: Suite) => {
    setSuiteState(s);
    setActivePreset(PRESETS.find((p) => JSON.stringify(p.suite) === JSON.stringify(s) && p.variant === variant)?.id ?? null);
  };
  const applyPreset = (id: PresetId) => {
    const p = presetOf(id);
    setSuiteState(p.suite);
    setVariant(p.variant);
    setActivePreset(id);
  };
  const state: SharedState = {
    suite,
    variant,
    setSuite,
    setVariant: (v) => {
      setVariant(v);
      setActivePreset(null);
    },
    applyPreset,
    activePreset,
  };

  if (scene === 'mutants') return <MutantScene picker={picker} state={state} />;
  if (scene === 'cost') return <CostScene picker={picker} state={state} />;
  return <CoverageScene picker={picker} state={state} />;
}
