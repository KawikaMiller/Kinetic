import { useScenePicker } from '../../components/ScenePicker';
import { BiasScene } from './BiasScene';
import { OPENING, type SceneId } from './opening';
import { PairsScene } from './PairsScene';
import { PlanesScene } from './PlanesScene';
import { RecoverScene } from './RecoverScene';
import { SeedScene } from './SeedScene';
import { SourcesScene } from './SourcesScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'pairs', label: 'Lines in the pairs' },
  { value: 'planes', label: 'RANDU planes' },
  { value: 'recover', label: 'Recovering the state' },
  { value: 'seed', label: 'Where the seed comes from' },
  { value: 'sources', label: 'Choose the right source' },
  { value: 'bias', label: 'Modulo bias' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'planes') return <PlanesScene key="planes" picker={picker} />;
  if (scene === 'recover') return <RecoverScene key="recover" picker={picker} />;
  if (scene === 'seed') return <SeedScene key="seed" picker={picker} />;
  if (scene === 'sources') return <SourcesScene key="sources" picker={picker} />;
  if (scene === 'bias') return <BiasScene key="bias" picker={picker} />;
  return <PairsScene key="pairs" picker={picker} />;
}
