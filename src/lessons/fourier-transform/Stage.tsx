import { useScenePicker } from '../../components/ScenePicker';
import { EpicycleScene } from './EpicycleScene';
import { HarmonicsScene } from './HarmonicsScene';
import { SamplingScene } from './SamplingScene';
import { SpectrumScene } from './SpectrumScene';
import './styles.css';

type Scene = 'harmonics' | 'epicycles' | 'spectrum' | 'sampling';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'harmonics', label: 'Harmonics' },
  { value: 'epicycles', label: 'Epicycles' },
  { value: 'spectrum', label: 'Spectrum and filtering' },
  { value: 'sampling', label: 'Sampling and leakage' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'harmonics' });
  if (scene === 'epicycles') return <EpicycleScene key={scene} picker={picker} />;
  if (scene === 'spectrum') return <SpectrumScene key={scene} picker={picker} />;
  if (scene === 'sampling') return <SamplingScene key={scene} picker={picker} />;
  return <HarmonicsScene key={scene} picker={picker} />;
}
