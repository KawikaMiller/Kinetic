import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { FormatScene } from './FormatScene';
import { LayoutScene } from './LayoutScene';
import { MessagesScene } from './MessagesScene';
import type { Locale } from './model';
import './styles.css';

type Scene = 'format' | 'messages' | 'layout';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'format', label: 'Formats and plurals' },
  { value: 'messages', label: 'Sentences' },
  { value: 'layout', label: 'Space and direction' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'format' });
  const [locale, setLocale] = useState<Locale>('en-US');
  const props = { picker, locale, setLocale };
  if (scene === 'format') return <FormatScene {...props} />;
  if (scene === 'messages') return <MessagesScene {...props} />;
  return <LayoutScene {...props} />;
}
