import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { CardsScene } from './CardsScene';
import { PlayScene } from './PlayScene';
import { RATIO } from './workload';
import './styles.css';

type Scene = 'workload' | 'staleness' | 'anomaly' | 'cards';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'workload', label: 'The workload' },
  { value: 'staleness', label: 'Staleness' },
  { value: 'anomaly', label: 'The update anomaly' },
  { value: 'cards', label: 'Where it lives' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'workload' });
  const [ratio, setRatio] = useState<number>(RATIO.initial);
  if (scene === 'cards') return <CardsScene picker={picker} />;
  return <PlayScene key={scene} scene={scene} picker={picker} ratio={ratio} setRatio={setRatio} />;
}
