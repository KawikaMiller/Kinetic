import { useScenePicker } from '../../components/ScenePicker';
import { ReviewScene } from './ReviewScene';
import { RewriteScene } from './RewriteScene';
import { SizeScene } from './SizeScene';
import './styles.css';

const SCENES = [
  { value: 'review' as const, label: 'Review it yourself' },
  { value: 'rewrite' as const, label: 'Rewrite a comment' },
  { value: 'size' as const, label: 'PR size' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'review' });
  if (scene === 'rewrite') return <RewriteScene picker={picker} />;
  if (scene === 'size') return <SizeScene picker={picker} />;
  return <ReviewScene picker={picker} />;
}
