import { useMemo, useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import type { Point } from '../../core/plot';
import { BoostScene } from './BoostScene';
import { MAX_ADDED, type Editor } from './DataPlot';
import { ForestScene } from './ForestScene';
import { presetData, type Cls, type PresetId, type Sample } from './model';
import { TreeScene } from './TreeScene';
import './styles.css';

type Scene = 'tree' | 'forest' | 'boost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tree', label: 'Tree' },
  { value: 'forest', label: 'Forest' },
  { value: 'boost', label: 'Boosting' },
];
const CURSOR_START: Point = [0.5, 1.3];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'tree' });
  const [preset, setPreset] = useState<PresetId>('moons');
  const [added, setAdded] = useState<Sample[]>([]);
  const [cursor, setCursor] = useState<Point>(CURSOR_START);
  const [addClass, setAddClass] = useState<Cls>(1);
  const base = useMemo(() => presetData(preset), [preset]);
  const data = useMemo(() => ({ train: [...base.train, ...added], val: base.val }), [base, added]);

  const editor: Editor = {
    preset, added, cursor, addClass, setCursor, setAddClass,
    load: (id) => {
      setPreset(id);
      setAdded([]);
    },
    add: (p) => {
      setCursor(p);
      if (added.length < MAX_ADDED) setAdded([...added, { x: p[0], y: p[1], label: addClass }]);
    },
    undo: () => setAdded(added.slice(0, -1)),
  };

  if (scene === 'tree') return <TreeScene picker={picker} data={data} editor={editor} />;
  if (scene === 'forest') return <ForestScene picker={picker} data={data} editor={editor} />;
  return <BoostScene picker={picker} data={data} editor={editor} />;
}
