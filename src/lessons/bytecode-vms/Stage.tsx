import { useScenePicker } from '../../components/ScenePicker';
import { AssembleScene } from './AssembleScene';
import { RealScene } from './RealScene';
import { RegisterScene } from './RegisterScene';
import { SourceScene } from './SourceScene';
import './styles.css';

const SCENES = [
  { value: 'compile', label: 'Source to bytecode' },
  { value: 'assemble', label: 'Write the bytecode' },
  { value: 'dispatch', label: 'The dispatch loop' },
  { value: 'registers', label: 'Stack or registers' },
  { value: 'real', label: 'Real bytecode' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'compile' });
  if (scene === 'assemble') return <AssembleScene picker={picker} />;
  if (scene === 'dispatch') return <SourceScene key="dispatch" picker={picker} dispatch />;
  if (scene === 'registers') return <RegisterScene picker={picker} />;
  if (scene === 'real') return <RealScene picker={picker} />;
  return <SourceScene key="compile" picker={picker} dispatch={false} />;
}
