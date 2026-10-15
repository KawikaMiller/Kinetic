import { useScenePicker } from '../../components/ScenePicker';
import { ArrowScene } from './ArrowScene';
import { RankScene } from './RankScene';
import { SCENES, SCENE_SETUP, type Scene } from './scenes';
import './styles.css';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'apply' });
  const setup = SCENE_SETUP[scene];
  // The key makes each scene mount fresh: two scenes share a component, and without it React would keep the
  // previous scene's matrix, web, damping and frame, so the scene would not open on its own start.
  if (setup.kind === 'arrows') return <ArrowScene key={scene} picker={picker} mode={setup.mode} />;
  return <RankScene key={scene} picker={picker} presetIds={setup.presetIds} initial={setup.initial} />;
}
