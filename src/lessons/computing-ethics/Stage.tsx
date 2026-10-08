import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { CASES } from './cases';
import { CaseScene } from './CaseScene';
import { LensScene } from './LensScene';
import { freshProgress, type Progress } from './progress';
import './styles.css';

const SCENES = [
  ...CASES.map((c) => ({ value: c.id, label: c.title })),
  { value: 'lenses', label: 'Reason it through' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Case', options: SCENES, initial: CASES[0].id });
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const c = CASES.find((x) => x.id === scene);
  if (!c) return <LensScene picker={picker} />;
  const current = progress[c.id] ?? freshProgress(c);
  return <CaseScene picker={picker} c={c} progress={current} onProgress={(p) => setProgress({ ...progress, [c.id]: p })} />;
}
