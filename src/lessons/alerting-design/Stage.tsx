import { useScenePicker } from '../../components/ScenePicker';
import { RuleScene } from './RuleScene';
import { SymptomScene } from './SymptomScene';
import { TriageScene } from './TriageScene';
import './styles.css';

const SCENES = [
  { value: 'rule', label: 'A seeded week' },
  { value: 'symptom', label: 'Symptom vs cause' },
  { value: 'triage', label: 'Triage board' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'rule' });
  if (scene === 'symptom') return <SymptomScene picker={picker} />;
  if (scene === 'triage') return <TriageScene picker={picker} />;
  return <RuleScene picker={picker} />;
}
